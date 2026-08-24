// FILE LOCATION:
// android/app/src/main/java/com/oarcel/docman/PdfRedactOverlayView.java

package com.oarcel.docman;

import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.RectF;
import android.util.AttributeSet;
import android.view.MotionEvent;
import android.view.View;
import android.view.ViewTreeObserver;

import com.github.barteksc.pdfviewer.PDFView;
import com.shockwave.pdfium.util.SizeF;

import java.util.ArrayList;
import java.util.List;

// Screen-space overlay for marking ONE rectangular area to redact on the
// current page. Deliberately modeled on PdfMarkOverlayView's already-proven
// one-shot drag-a-shape-then-auto-exit gesture (a rectangle here instead of
// an oval) rather than anything more elaborate -- same reasoning as
// PdfSignaturePlacementView: PdfViewerActivity disables PDFView's own
// swipe/pinch while this is active, so there's no touch-forwarding/gesture
// arbitration to get wrong, and this mirrors a mechanism this app already
// ships and has been confirmed working.
//
// IMPORTANT: this view only handles marking the area and reporting where it
// is -- it does NOT itself make anything "redacted". PdfViewerActivity is
// what actually removes the underlying page content and flattens a new
// image in its place (see its redactSelectedAreaAndSave() for why a real
// redaction has to do that rather than just drawing a black box over the
// existing content).
public class PdfRedactOverlayView extends View {

    public interface OnRedactAreaListener {
        void onRedactAreaMarked();
    }

    private PDFView pdfView;
    private boolean modeEnabled = false;
    private RectF activeRect = null;
    private RectF confirmedRect = null;
    private float startX, startY;
    private OnRedactAreaListener listener;

    // Areas the person has actually confirmed redacting, kept drawn (fully
    // opaque -- see fillPaint below) for the rest of this viewing session,
    // same reasoning as PdfTextSelectionOverlayView's committedHighlights:
    // otherwise there's no visible sign anything happened until you go dig
    // up the saved copy in Downloads. {page, fracLeft, fracTop, fracW,
    // fracH} per entry -- same normalized-fraction convention as
    // getNormalizedRedactArea() below, re-projected onto the screen every
    // frame so it tracks scroll/zoom correctly instead of freezing at
    // wherever it was drawn at confirm time.
    private final List<float[]> committedAreas = new ArrayList<>();

    private final Paint strokePaint = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint fillPaint = new Paint(Paint.ANTI_ALIAS_FLAG);

    // Same "sync to PDFView's own scroll/zoom animation" technique as
    // PdfTextSelectionOverlayView's scrollSyncListener (see that class's
    // comment for why a sibling view needs this at all) -- only needed here
    // once there's at least one committed area to keep in place.
    private float lastSyncXOffset = Float.NaN, lastSyncYOffset = Float.NaN, lastSyncZoom = Float.NaN;
    private final ViewTreeObserver.OnDrawListener scrollSyncListener = new ViewTreeObserver.OnDrawListener() {
        @Override
        public void onDraw() {
            if (pdfView == null || committedAreas.isEmpty()) return;
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
        strokePaint.setStyle(Paint.Style.STROKE);
        strokePaint.setStrokeWidth(3f * context.getResources().getDisplayMetrics().density);
        strokePaint.setColor(Color.BLACK);

        fillPaint.setStyle(Paint.Style.FILL);
        // Fully opaque -- a translucent preview let the marked text still
        // read through it, which looked like the redaction had failed even
        // during normal marking/confirming.
        fillPaint.setColor(Color.BLACK);
    }

    @Override
    protected void onAttachedToWindow() {
        super.onAttachedToWindow();
        getViewTreeObserver().addOnDrawListener(scrollSyncListener);
    }

    @Override
    protected void onDetachedFromWindow() {
        getViewTreeObserver().removeOnDrawListener(scrollSyncListener);
        super.onDetachedFromWindow();
    }

    public void setPdfView(PDFView pdfView) {
        this.pdfView = pdfView;
    }

    public void setOnRedactAreaListener(OnRedactAreaListener l) {
        this.listener = l;
    }

    public void setModeEnabled(boolean enabled) {
        modeEnabled = enabled;
        if (!enabled) activeRect = null;
        invalidate();
    }

    public boolean isModeEnabled() {
        return modeEnabled;
    }

    // Called when the person cancels the confirmation instead of redacting
    // -- discards the marked box without committing it.
    public void clearConfirmedRect() {
        confirmedRect = null;
        invalidate();
    }

    // Called once the marked area has actually been redacted: turns the
    // temporary preview box into a permanent (for this session) opaque
    // marker so there's immediate, persistent visual confirmation, matching
    // PdfTextSelectionOverlayView.commitHighlight()'s reasoning.
    public void commitRedaction() {
        float[] area = getNormalizedRedactArea();
        if (area != null) committedAreas.add(area);
        confirmedRect = null;
        invalidate();
    }

    @Override
    protected void onDraw(Canvas canvas) {
        super.onDraw(canvas);
        drawCommittedAreas(canvas);
        if (activeRect != null) {
            canvas.drawRect(activeRect, fillPaint);
            canvas.drawRect(activeRect, strokePaint);
        }
        if (confirmedRect != null) {
            canvas.drawRect(confirmedRect, fillPaint);
            canvas.drawRect(confirmedRect, strokePaint);
        }
    }

    private void drawCommittedAreas(Canvas canvas) {
        if (pdfView == null || committedAreas.isEmpty()) return;
        for (float[] area : committedAreas) {
            int page = (int) area[0];
            RectF pageRect = pageScreenRect(page);
            if (pageRect == null) continue;
            float left = pageRect.left + area[1] * pageRect.width();
            float top = pageRect.top + area[2] * pageRect.height();
            float w = area[3] * pageRect.width();
            float h = area[4] * pageRect.height();
            canvas.drawRect(left, top, left + w, top + h, fillPaint);
        }
    }

    @Override
    public boolean onTouchEvent(MotionEvent event) {
        if (!modeEnabled) return false;
        switch (event.getActionMasked()) {
            case MotionEvent.ACTION_DOWN:
                startX = event.getX();
                startY = event.getY();
                activeRect = new RectF(startX, startY, startX, startY);
                invalidate();
                return true;

            case MotionEvent.ACTION_MOVE:
                if (activeRect != null) {
                    updateActiveRect(event.getX(), event.getY());
                    invalidate();
                }
                return true;

            case MotionEvent.ACTION_UP:
            case MotionEvent.ACTION_CANCEL:
                if (activeRect != null) {
                    updateActiveRect(event.getX(), event.getY());
                    // Ignore accidental taps that produced a near-zero box,
                    // same threshold/reasoning as PdfMarkOverlayView.
                    if (activeRect.width() > 12 && activeRect.height() > 12) {
                        confirmedRect = new RectF(activeRect);
                        modeEnabled = false;
                        if (listener != null) listener.onRedactAreaMarked();
                    }
                    activeRect = null;
                    invalidate();
                }
                return true;

            default:
                return false;
        }
    }

    private void updateActiveRect(float x, float y) {
        activeRect.left = Math.min(startX, x);
        activeRect.top = Math.min(startY, y);
        activeRect.right = Math.max(startX, x);
        activeRect.bottom = Math.max(startY, y);
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

    // {page, fracLeft, fracTop, fracWidth, fracHeight}, top-down fractions
    // of the current page's own on-screen box -- same convention as
    // PdfSignaturePlacementView.getNormalizedPlacement(), for the same
    // reason (resolution-independent; PdfViewerActivity converts to
    // absolute pixels only once it knows the flattened bitmap's real size).
    public float[] getNormalizedRedactArea() {
        if (pdfView == null || confirmedRect == null) return null;
        int page = pdfView.getCurrentPage();
        RectF pageRect = pageScreenRect(page);
        if (pageRect == null || pageRect.width() <= 0 || pageRect.height() <= 0) return null;
        float fracLeft = (confirmedRect.left - pageRect.left) / pageRect.width();
        float fracTop = (confirmedRect.top - pageRect.top) / pageRect.height();
        float fracW = confirmedRect.width() / pageRect.width();
        float fracH = confirmedRect.height() / pageRect.height();
        return new float[]{page, fracLeft, fracTop, fracW, fracH};
    }
}
