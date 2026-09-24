// FILE LOCATION:
// android/app/src/main/java/com/docman/PdfRedactOverlayView.java

package com.docman;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.RectF;
import android.os.SystemClock;
import android.util.AttributeSet;
import android.util.SparseArray;
import android.view.MotionEvent;
import android.view.View;
import android.view.ViewTreeObserver;

import com.github.barteksc.pdfviewer.PDFView;
import com.shockwave.pdfium.util.SizeF;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashSet;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

// Screen-space overlay for the Erase tool's brush. One finger paints strokes
// on any page; as soon as a second finger lands, the rest of that gesture is
// handed to PDFView so the page can be moved and zoomed (same sibling-
// forwarding idea as PdfTextSelectionOverlayView -- see its TOUCH MODEL
// comment).
//
// Strokes are stored in page units (see UNITS), so they stay glued to the
// page at any scroll or zoom. A paper-colour stroke is split into short
// pieces, and each piece takes the paper colour sampled just around it from a
// small render of that page (PdfViewerActivity.renderEraseSample), so what is
// on screen after the finger lifts is exactly what gets saved.
//
// IMPORTANT: this view only records strokes. PdfViewerActivity.saveErasedCopy()
// is what removes the content, by flattening each affected page to an image
// with the strokes painted in, so nothing underneath survives in the copy.
public class PdfRedactOverlayView extends View {

    public static final int MODE_PAPER = 0;
    public static final int MODE_BLACK = 1;

    // x runs 0..UNITS across the page width and y runs 0..UNITS*aspect down
    // it, so a single uniform scale maps a stroke onto the page at any zoom.
    static final float UNITS = 1000f;

    private static final int MAX_SAMPLES = 4;
    private static final int SAMPLE_CAP = 1200;
    private static final int LIVE_PAPER = Color.argb(150, 255, 148, 66);
    private static final int LIVE_BLACK = Color.argb(190, 0, 0, 0);

    public interface EraseListener {
        void onStrokesChanged();
        void onPageSampleNeeded(int page);
    }

    public static final class Stroke {
        final int page;
        final int mode;
        final float aspect;   // page height / page width
        final float width;    // brush diameter, page units
        float[] pts = new float[64];
        int count = 0;
        final Path livePath;
        int[] chunkEnds;      // exclusive end point index of each piece
        Path[] paths;         // one path per piece
        int[] colours;        // one colour per piece; null until sampled

        Stroke(int page, int mode, float aspect, float width) {
            this.page = page;
            this.mode = mode;
            this.aspect = aspect;
            this.width = width;
            this.livePath = new Path();
        }

        private Stroke(Stroke o) {
            page = o.page;
            mode = o.mode;
            aspect = o.aspect;
            width = o.width;
            pts = o.pts;
            count = o.count;
            livePath = o.livePath;
            chunkEnds = o.chunkEnds;
            paths = o.paths;
            colours = o.colours == null ? null : o.colours.clone();
        }

        void add(float x, float y) {
            if (count * 2 + 2 > pts.length) pts = Arrays.copyOf(pts, pts.length * 2);
            pts[count * 2] = x;
            pts[count * 2 + 1] = y;
            if (count == 0) {
                livePath.moveTo(x, y);
                livePath.lineTo(x + 0.01f, y); // a tap still leaves a round dot
            } else {
                livePath.lineTo(x, y);
            }
            count++;
        }

        // Splits the stroke into pieces about three brush widths long, so each
        // can take the paper colour of its own neighbourhood -- a scanned page
        // is rarely one even colour from edge to edge.
        void finish() {
            float pieceLen = Math.max(width * 3f, 20f);
            int[] ends = new int[Math.max(1, count)];
            int k = 0;
            float run = 0f;
            for (int i = 1; i < count - 1; i++) {
                run += (float) Math.hypot(pts[i * 2] - pts[i * 2 - 2], pts[i * 2 + 1] - pts[i * 2 - 1]);
                if (run >= pieceLen) {
                    ends[k++] = i + 1;
                    run = 0f;
                }
            }
            ends[k++] = count;
            chunkEnds = Arrays.copyOf(ends, k);
            paths = new Path[k];
            int start = 0;
            for (int c = 0; c < k; c++) {
                // Each piece starts on the previous piece's last point, so
                // the round joins overlap and there is no seam between them.
                int from = Math.max(0, start - 1);
                Path p = new Path();
                p.moveTo(pts[from * 2], pts[from * 2 + 1]);
                p.lineTo(pts[from * 2] + 0.01f, pts[from * 2 + 1]);
                for (int i = from + 1; i < chunkEnds[c]; i++) p.lineTo(pts[i * 2], pts[i * 2 + 1]);
                paths[c] = p;
                start = chunkEnds[c];
            }
        }
    }

    private PDFView pdfView;
    private EraseListener listener;
    private boolean active = false;
    private int colorMode = MODE_PAPER;
    private float brushPx;
    private boolean nightMode = false;
    private boolean sizePreviewVisible = false;

    private final List<Stroke> strokes = new ArrayList<>();
    private final List<Stroke> redoStack = new ArrayList<>();
    private Stroke current;
    private boolean fingerDown = false;
    private boolean forwarding = false;
    private float lastX, lastY;
    private long strokeStartTime;
    private float strokeTravel;

    private final LinkedHashMap<Integer, Bitmap> samples = new LinkedHashMap<>(8, 0.75f, true);
    private final Set<Integer> samplesRequested = new HashSet<>();
    private final Set<Integer> samplesFailed = new HashSet<>();
    private final SparseArray<RectF> frameRects = new SparseArray<>();

    private final float density;
    private final Paint strokePaint = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint ringLight = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint ringDark = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint previewFill = new Paint(Paint.ANTI_ALIAS_FLAG);

    // Keeps strokes glued to the page while PDFView scrolls or zooms -- same
    // technique as PdfTextSelectionOverlayView's scrollSyncListener.
    private float lastSyncXOffset = Float.NaN, lastSyncYOffset = Float.NaN, lastSyncZoom = Float.NaN;
    private final ViewTreeObserver.OnDrawListener scrollSyncListener = new ViewTreeObserver.OnDrawListener() {
        @Override
        public void onDraw() {
            if (pdfView == null || (strokes.isEmpty() && current == null)) return;
            float x = pdfView.getCurrentXOffset();
            float y = pdfView.getCurrentYOffset();
            float z = pdfView.getZoom();
            if (x != lastSyncXOffset || y != lastSyncYOffset || z != lastSyncZoom) {
                lastSyncXOffset = x;
                lastSyncYOffset = y;
                lastSyncZoom = z;
                postInvalidateOnAnimation();
            }
        }
    };

    public PdfRedactOverlayView(Context context, AttributeSet attrs) {
        super(context, attrs);
        density = context.getResources().getDisplayMetrics().density;
        brushPx = 26f * density;

        strokePaint.setStyle(Paint.Style.STROKE);
        strokePaint.setStrokeCap(Paint.Cap.ROUND);
        strokePaint.setStrokeJoin(Paint.Join.ROUND);

        ringLight.setStyle(Paint.Style.STROKE);
        ringLight.setStrokeWidth(1.6f * density);
        ringLight.setColor(Color.WHITE);
        ringDark.setStyle(Paint.Style.STROKE);
        ringDark.setStrokeWidth(3.4f * density);
        ringDark.setColor(Color.argb(110, 0, 0, 0));
        previewFill.setStyle(Paint.Style.FILL);
        previewFill.setColor(Color.argb(64, 255, 148, 66));
    }

    @Override
    protected void onAttachedToWindow() {
        super.onAttachedToWindow();
        getViewTreeObserver().addOnDrawListener(scrollSyncListener);
    }

    @Override
    protected void onDetachedFromWindow() {
        getViewTreeObserver().removeOnDrawListener(scrollSyncListener);
        dropSamples();
        super.onDetachedFromWindow();
    }

    public void setPdfView(PDFView pdfView) {
        this.pdfView = pdfView;
    }

    public void setEraseListener(EraseListener l) {
        this.listener = l;
    }

    // true: this view owns touches (one finger paints, two are forwarded).
    public void setActive(boolean on) {
        active = on;
        if (!on) {
            current = null;
            fingerDown = false;
            forwarding = false;
            sizePreviewVisible = false;
        }
        invalidate();
    }

    public void setColorMode(int mode) {
        colorMode = mode == MODE_BLACK ? MODE_BLACK : MODE_PAPER;
    }

    public int getColorMode() {
        return colorMode;
    }

    public void setBrushSizePx(float px) {
        brushPx = px;
        if (sizePreviewVisible) invalidate();
    }

    public void setSizePreviewVisible(boolean visible) {
        sizePreviewVisible = visible;
        invalidate();
    }

    // The page is drawn inverted in Night Mode, so the preview is too.
    public void setNightMode(boolean on) {
        nightMode = on;
        invalidate();
    }

    public int getStrokeCount() {
        return strokes.size();
    }

    public int getEditedPageCount() {
        Set<Integer> pages = new HashSet<>();
        for (Stroke s : strokes) pages.add(s.page);
        return pages.size();
    }

    public boolean canUndo() {
        return !strokes.isEmpty();
    }

    public boolean canRedo() {
        return !redoStack.isEmpty();
    }

    public void undo() {
        if (strokes.isEmpty()) return;
        redoStack.add(strokes.remove(strokes.size() - 1));
        invalidate();
        notifyChanged();
    }

    public void redo() {
        if (redoStack.isEmpty()) return;
        strokes.add(redoStack.remove(redoStack.size() - 1));
        invalidate();
        notifyChanged();
    }

    public void clearAll() {
        strokes.clear();
        redoStack.clear();
        current = null;
        fingerDown = false;
        forwarding = false;
        dropSamples();
        invalidate();
        notifyChanged();
    }

    // Copies safe to hand to the save thread (colours are cloned; paths are
    // never modified after a stroke is finished).
    public List<Stroke> getStrokesForSave() {
        List<Stroke> copy = new ArrayList<>(strokes.size());
        for (Stroke s : strokes) copy.add(new Stroke(s));
        return copy;
    }

    public void prepareSample(int page) {
        if (active) ensureSample(page);
    }

    // Called on the main thread with a small render of `page`, or null if it
    // couldn't be rendered (the saved copy then samples its own render).
    public void setPageSample(int page, Bitmap bmp) {
        samplesRequested.remove(page);
        if (bmp == null) {
            samplesFailed.add(page);
            invalidate();
            return;
        }
        if (!active) {
            bmp.recycle();
            return;
        }
        Bitmap old = samples.put(page, bmp);
        if (old != null && old != bmp) old.recycle();
        while (samples.size() > MAX_SAMPLES) {
            Iterator<Map.Entry<Integer, Bitmap>> it = samples.entrySet().iterator();
            Bitmap eldest = it.next().getValue();
            it.remove();
            eldest.recycle();
        }
        colourPending(strokes, page, bmp);
        colourPending(redoStack, page, bmp);
        invalidate();
    }

    private static void colourPending(List<Stroke> list, int page, Bitmap bmp) {
        for (Stroke s : list) {
            if (s.page == page && s.mode == MODE_PAPER && s.colours == null) s.colours = sampleColours(s, bmp);
        }
    }

    private void ensureSample(int page) {
        if (listener == null || page < 0 || samples.containsKey(page) || samplesRequested.contains(page)) return;
        samplesRequested.add(page);
        samplesFailed.remove(page);
        listener.onPageSampleNeeded(page);
    }

    private void dropSamples() {
        for (Bitmap b : samples.values()) b.recycle();
        samples.clear();
        samplesRequested.clear();
        samplesFailed.clear();
    }

    private void notifyChanged() {
        if (listener != null) listener.onStrokesChanged();
    }

    // ============================================================
    // PAPER COLOUR -- the median colour of a thin ring just outside each
    // piece of the stroke, lightly smoothed along the stroke so neighbouring
    // pieces don't step visibly. Used for the on-screen result and, when a
    // sample never arrived, by the save on its own full-size render.
    // ============================================================
    static int[] sampleColours(Stroke s, Bitmap page) {
        int w = page.getWidth(), h = page.getHeight();
        float sx = w / UNITS, sy = h / (UNITS * s.aspect);
        int pieces = s.chunkEnds.length;
        int[] out = new int[pieces];
        int[] rs = new int[SAMPLE_CAP], gs = new int[SAMPLE_CAP], bs = new int[SAMPLE_CAP];
        int gap = Math.max(1, Math.round(w * 0.004f));
        float half = s.width / 2f;
        int start = 0;
        for (int c = 0; c < pieces; c++) {
            int from = Math.max(0, start - 1);
            float minX = Float.MAX_VALUE, minY = Float.MAX_VALUE, maxX = -Float.MAX_VALUE, maxY = -Float.MAX_VALUE;
            for (int i = from; i < s.chunkEnds[c]; i++) {
                minX = Math.min(minX, s.pts[i * 2]);
                maxX = Math.max(maxX, s.pts[i * 2]);
                minY = Math.min(minY, s.pts[i * 2 + 1]);
                maxY = Math.max(maxY, s.pts[i * 2 + 1]);
            }
            int l = (int) Math.floor((minX - half) * sx);
            int t = (int) Math.floor((minY - half) * sy);
            int r = (int) Math.ceil((maxX + half) * sx);
            int b = (int) Math.ceil((maxY + half) * sy);
            int stepX = Math.max(1, (r - l) / 24), stepY = Math.max(1, (b - t) / 24);
            int n = 0;
            for (int ring = 1; ring <= 3; ring++) {
                int d = gap * ring;
                for (int x = l - d; x <= r + d && n < SAMPLE_CAP - 2; x += stepX) {
                    n = take(page, x, t - d, rs, gs, bs, n);
                    n = take(page, x, b + d, rs, gs, bs, n);
                }
                for (int y = t; y <= b && n < SAMPLE_CAP - 2; y += stepY) {
                    n = take(page, l - d, y, rs, gs, bs, n);
                    n = take(page, r + d, y, rs, gs, bs, n);
                }
            }
            if (n == 0) {
                out[c] = Color.WHITE;
            } else {
                Arrays.sort(rs, 0, n);
                Arrays.sort(gs, 0, n);
                Arrays.sort(bs, 0, n);
                out[c] = Color.rgb(rs[n / 2], gs[n / 2], bs[n / 2]);
            }
            start = s.chunkEnds[c];
        }
        if (pieces > 2) {
            int[] src = out.clone();
            for (int c = 1; c < pieces - 1; c++) {
                int a = src[c - 1], m = src[c], z = src[c + 1];
                out[c] = Color.rgb(
                        (Color.red(a) + 2 * Color.red(m) + Color.red(z)) / 4,
                        (Color.green(a) + 2 * Color.green(m) + Color.green(z)) / 4,
                        (Color.blue(a) + 2 * Color.blue(m) + Color.blue(z)) / 4);
            }
        }
        return out;
    }

    private static int take(Bitmap bmp, int x, int y, int[] rs, int[] gs, int[] bs, int n) {
        if (x < 0 || y < 0 || x >= bmp.getWidth() || y >= bmp.getHeight()) return n;
        int c = bmp.getPixel(x, y);
        rs[n] = Color.red(c);
        gs[n] = Color.green(c);
        bs[n] = Color.blue(c);
        return n + 1;
    }

    private int display(int colour) {
        if (!nightMode) return colour;
        return Color.rgb(255 - Color.red(colour), 255 - Color.green(colour), 255 - Color.blue(colour));
    }

    @Override
    protected void onDraw(Canvas canvas) {
        super.onDraw(canvas);
        if (pdfView == null) return;
        frameRects.clear();
        for (Stroke s : strokes) drawStroke(canvas, s, false);
        if (current != null) drawStroke(canvas, current, true);

        if (fingerDown && current != null) {
            float r = brushPx / 2f;
            canvas.drawCircle(lastX, lastY, r, ringDark);
            canvas.drawCircle(lastX, lastY, r, ringLight);
        }
        if (sizePreviewVisible) {
            float cx = getWidth() / 2f, cy = getHeight() / 2f, r = brushPx / 2f;
            canvas.drawCircle(cx, cy, r, previewFill);
            canvas.drawCircle(cx, cy, r, ringDark);
            canvas.drawCircle(cx, cy, r, ringLight);
        }
    }

    private void drawStroke(Canvas canvas, Stroke s, boolean live) {
        RectF pr = frameRects.get(s.page);
        if (pr == null) {
            pr = pageScreenRect(s.page);
            if (pr == null) return;
            frameRects.put(s.page, pr);
        }
        if (pr.bottom < 0 || pr.top > getHeight() || pr.right < 0 || pr.left > getWidth()) return;

        float k = pr.width() / UNITS;
        canvas.save();
        canvas.clipRect(pr);
        canvas.translate(pr.left, pr.top);
        canvas.scale(k, k);
        strokePaint.setStrokeWidth(s.width);
        if (live || s.paths == null) {
            strokePaint.setColor(s.mode == MODE_BLACK ? LIVE_BLACK : LIVE_PAPER);
            canvas.drawPath(s.livePath, strokePaint);
        } else if (s.mode == MODE_BLACK) {
            strokePaint.setColor(display(Color.BLACK));
            canvas.drawPath(s.livePath, strokePaint);
        } else if (s.colours != null) {
            for (int c = 0; c < s.paths.length; c++) {
                strokePaint.setColor(display(s.colours[c]));
                canvas.drawPath(s.paths[c], strokePaint);
            }
        } else if (samplesFailed.contains(s.page)) {
            strokePaint.setColor(display(Color.WHITE));
            canvas.drawPath(s.livePath, strokePaint);
        } else {
            // Colour still on its way: keep the painting look for a moment.
            strokePaint.setColor(LIVE_PAPER);
            canvas.drawPath(s.livePath, strokePaint);
        }
        canvas.restore();
    }

    // ============================================================
    // TOUCH -- one finger paints. A second finger turns the rest of the
    // gesture into a move/zoom for PDFView: it never saw the first finger's
    // ACTION_DOWN, so it gets a synthesized one before the real events.
    // ============================================================
    @Override
    public boolean onTouchEvent(MotionEvent e) {
        if (!active || pdfView == null) return false;
        switch (e.getActionMasked()) {
            case MotionEvent.ACTION_DOWN:
                forwarding = false;
                beginStroke(e.getX(), e.getY());
                return true;

            case MotionEvent.ACTION_POINTER_DOWN:
                if (!forwarding) {
                    endStrokeForSecondFinger();
                    forwarding = true;
                    forwardDown(e);
                }
                forward(e);
                return true;

            case MotionEvent.ACTION_MOVE:
                if (forwarding) {
                    forward(e);
                } else if (current != null) {
                    for (int h = 0; h < e.getHistorySize(); h++) addPoint(e.getHistoricalX(h), e.getHistoricalY(h));
                    addPoint(e.getX(), e.getY());
                    lastX = e.getX();
                    lastY = e.getY();
                    invalidate();
                }
                return true;

            case MotionEvent.ACTION_POINTER_UP:
                if (forwarding) forward(e);
                return true;

            case MotionEvent.ACTION_UP:
                if (forwarding) {
                    forward(e);
                    forwarding = false;
                } else if (current != null) {
                    addPoint(e.getX(), e.getY());
                    commitCurrent();
                }
                fingerDown = false;
                invalidate();
                return true;

            case MotionEvent.ACTION_CANCEL:
                if (forwarding) forward(e);
                forwarding = false;
                current = null;
                fingerDown = false;
                invalidate();
                return true;

            default:
                return true;
        }
    }

    private void beginStroke(float x, float y) {
        current = null;
        int page = pageAt(x, y);
        if (page < 0) return;
        RectF pr = pageScreenRect(page);
        if (pr == null || pr.width() <= 0) return;
        current = new Stroke(page, colorMode, pr.height() / pr.width(), brushPx / pr.width() * UNITS);
        strokeStartTime = SystemClock.uptimeMillis();
        strokeTravel = 0f;
        lastX = x;
        lastY = y;
        fingerDown = true;
        addPoint(x, y);
        if (colorMode == MODE_PAPER) ensureSample(page);
        invalidate();
    }

    private void addPoint(float x, float y) {
        if (current == null) return;
        RectF pr = pageScreenRect(current.page);
        if (pr == null || pr.width() <= 0) return;
        if (current.count > 0) {
            float k = pr.width() / UNITS;
            float px = pr.left + current.pts[current.count * 2 - 2] * k;
            float py = pr.top + current.pts[current.count * 2 - 1] * k;
            float moved = (float) Math.hypot(x - px, y - py);
            if (moved < 1.5f * density) return;
            strokeTravel += moved;
        }
        current.add((x - pr.left) / pr.width() * UNITS, (y - pr.top) / pr.width() * UNITS);
    }

    // A stroke that had barely started when the second finger landed was the
    // start of a pinch, not painting -- drop it. A real stroke is kept.
    private void endStrokeForSecondFinger() {
        if (current != null) {
            boolean real = strokeTravel >= 24f * density && SystemClock.uptimeMillis() - strokeStartTime >= 250;
            if (real) commitCurrent();
            else current = null;
        }
        fingerDown = false;
        invalidate();
    }

    private void commitCurrent() {
        Stroke s = current;
        current = null;
        if (s == null || s.count == 0) return;
        s.finish();
        strokes.add(s);
        redoStack.clear();
        if (s.mode == MODE_PAPER) {
            Bitmap sample = samples.get(s.page);
            if (sample != null && !sample.isRecycled()) s.colours = sampleColours(s, sample);
            else ensureSample(s.page);
        }
        notifyChanged();
    }

    private void forwardDown(MotionEvent e) {
        int keep = e.getActionIndex() == 0 ? 1 : 0;
        MotionEvent.PointerProperties[] props = {new MotionEvent.PointerProperties()};
        MotionEvent.PointerCoords[] coords = {new MotionEvent.PointerCoords()};
        e.getPointerProperties(keep, props[0]);
        e.getPointerCoords(keep, coords[0]);
        MotionEvent down = MotionEvent.obtain(e.getDownTime(), e.getEventTime(), MotionEvent.ACTION_DOWN,
                1, props, coords, e.getMetaState(), e.getButtonState(), e.getXPrecision(), e.getYPrecision(),
                e.getDeviceId(), e.getEdgeFlags(), e.getSource(), e.getFlags());
        forward(down);
        down.recycle();
    }

    private void forward(MotionEvent e) {
        MotionEvent copy = MotionEvent.obtain(e);
        copy.offsetLocation(getLeft() - pdfView.getLeft(), getTop() - pdfView.getTop());
        pdfView.dispatchTouchEvent(copy);
        copy.recycle();
    }

    private int pageAt(float x, float y) {
        int count = pdfView.getPageCount();
        int cur = pdfView.getCurrentPage();
        for (int p = Math.max(0, cur - 2); p <= Math.min(count - 1, cur + 2); p++) {
            RectF r = pageScreenRect(p);
            if (r != null && r.contains(x, y)) return p;
        }
        for (int p = 0; p < count; p++) {
            RectF r = pageScreenRect(p);
            if (r != null && r.contains(x, y)) return p;
        }
        return -1;
    }

    // ============================================================
    // GEOMETRY -- same proven formula duplicated in
    // PdfTextSelectionOverlayView/PdfSignaturePlacementView (see either
    // class's header comment for the derivation).
    // ============================================================
    private RectF pageScreenRect(int pageIndex) {
        if (pdfView == null || pageIndex < 0 || pageIndex >= pdfView.getPageCount()) return null;
        boolean vertical = pdfView.isSwipeVertical();
        float zoom = pdfView.getZoom();
        float spacing = pdfView.getSpacingPx();

        float maxWidth = 0f, maxHeight = 0f;
        float rawOffset = 0f;
        int count = pdfView.getPageCount();
        for (int i = 0; i < count; i++) {
            SizeF size = pdfView.getPageSize(i);
            if (size == null) continue;
            maxWidth = Math.max(maxWidth, size.getWidth());
            maxHeight = Math.max(maxHeight, size.getHeight());
            if (i < pageIndex) {
                rawOffset += (vertical ? size.getHeight() : size.getWidth()) + spacing;
            }
        }
        SizeF pageSize = pdfView.getPageSize(pageIndex);
        if (pageSize == null) return null;

        float primaryPx = rawOffset * zoom;
        float secondaryPx = vertical
                ? zoom * (maxWidth - pageSize.getWidth()) / 2f
                : zoom * (maxHeight - pageSize.getHeight()) / 2f;

        float left, top;
        if (vertical) {
            left = pdfView.getCurrentXOffset() + secondaryPx;
            top = pdfView.getCurrentYOffset() + primaryPx;
        } else {
            left = pdfView.getCurrentXOffset() + primaryPx;
            top = pdfView.getCurrentYOffset() + secondaryPx;
        }
        float w = pageSize.getWidth() * zoom;
        float h = pageSize.getHeight() * zoom;
        return new RectF(left, top, left + w, top + h);
    }
}
