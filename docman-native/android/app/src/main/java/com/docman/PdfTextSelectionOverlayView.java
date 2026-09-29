// FILE LOCATION:
// android/app/src/main/java/com/oarcel/docman/PdfTextSelectionOverlayView.java

package com.docman;

import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.RectF;
import android.util.AttributeSet;
import android.view.HapticFeedbackConstants;
import android.view.MotionEvent;
import android.view.View;
import android.view.ViewConfiguration;
import android.view.ViewTreeObserver;

import com.github.barteksc.pdfviewer.PDFView;
import com.shockwave.pdfium.util.SizeF;

import java.util.ArrayList;
import java.util.List;

// Screen-space overlay that implements drag-to-select text on top of PDFView,
// sibling to PdfMarkOverlayView in the same rotating pdfContainer (see
// activity_pdf_viewer.xml) so it inherits Rotate for free.
//
// WHY THIS EXISTS: the pdfium binding this app uses has no character/text-page
// native API (only nativeGetDocumentMetaText -- see the comment on
// PdfViewerActivity.ensurePageTextsExtracted), so there's no engine-level
// selection to hook into. Character boxes come from PDFBox instead (see
// PdfViewerActivity.PageTextLayout/CharBox), in raw PDF-point space, and this
// view is what projects them onto PDFView's current screen position/zoom and
// turns finger drags into a selected character range.
//
// TOUCH MODEL: PDFView is a *sibling*, not a child, so there's no
// onInterceptTouchEvent to lean on. Standard Android touch dispatch locks a
// whole gesture (DOWN..UP) to whichever sibling first consumes ACTION_DOWN --
// PdfMarkOverlayView's own comment already documents that returning false on
// DOWN lets touches "fall straight through" to PDFView underneath. Here we
// need the opposite some of the time (own the gesture to drag a selection
// handle) and the fall-through behavior the rest of the time (let PDFView
// scroll/pinch normally) -- within a SINGLE gesture, decided only once it's
// already started. So this view always claims ACTION_DOWN, and manually
// forwards a copy of every event to pdfView.dispatchTouchEvent(...) until the
// moment it commits to a selection action (long-press fires, or a drag starts
// on an existing handle), at which point it sends PDFView one ACTION_CANCEL
// so it doesn't get stuck mid-scroll and stops forwarding for the rest of
// that gesture.
public class PdfTextSelectionOverlayView extends View {

    public interface OnSelectionListener {
        // anchorX/anchorY: screen point (this view's local coords) to anchor
        // a floating Copy button near -- the top-left of the selection.
        // hasSelection=false means the selection was cleared; anchor is
        // meaningless in that case.
        void onSelectionChanged(boolean hasSelection, float anchorX, float anchorY);

        // Fired when a touch landed here before the DOCUMENT has even
        // finished its first load (textLayouts itself still null) -- a
        // brief, rare window right after opening a PDF. This exists so the
        // person gets *some* feedback instead of a touch that just seems to
        // not work.
        void onTextNotReady();

        // Fired when a long-press resolved to a specific page whose own
        // character positions haven't been extracted yet (see
        // PdfViewerActivity.ensurePageTextLayoutForPage) -- extraction is
        // lazy, one page at a time, precisely so a large document doesn't
        // block selection everywhere until the whole thing is processed.
        // The listener should extract that one page, then call
        // retrySelectionAt(touchX, touchY) once it's ready so the original
        // long-press still results in a selection instead of silently
        // doing nothing.
        void onPageTextNeeded(int pageIndex, float touchX, float touchY);

        // Fired when a long-press found no text under the finger even after
        // the page was (re)read -- e.g. a CAD drawing whose labels are lines,
        // not text. Lets the viewer say why instead of doing nothing.
        void onNoTextAt(int pageIndex);
    }

    private PDFView pdfView;
    private List<PdfViewerActivity.PageTextLayout> textLayouts;
    private OnSelectionListener listener;
    // While true (the Mark tool is active), this view claims nothing so
    // Mark gets first crack at every touch -- see PdfViewerActivity's
    // toggleMarkMode().
    private boolean markModeActive = false;
    // See the comment in onTouchEvent: these two stop the leftover finger of a
    // pinch from dragging the page.
    private boolean pinchInProgress = false;
    private boolean suppressDragUntilUp = false;

    // Precomputed once per document load: cumulative raw (zoom=1) primary-axis
    // offset of each page within the continuous strip, plus the largest page
    // width/height across the doc -- mirrors PdfFile's own (package-private,
    // unreachable) preparePagesOffset()/getMaxPageWidth()/getMaxPageHeight(),
    // reconstructed here from PDFView's public getPageSize()/getSpacingPx().
    private float[] cumulativeRawOffsets;
    private float maxPageWidthAtZoom1 = 0f;
    private float maxPageHeightAtZoom1 = 0f;
    private boolean geometryReady = false;

    private final int longPressTimeoutMs;
    // The system's own touch slop (~8dp) is tuned for "did the finger move
    // at all", not for "hold still for 500ms to word-select on a dense,
    // small-text page" -- natural hand tremor over that long routinely
    // exceeds it, silently cancelling the long-press before it can fire (the
    // word-select-sometimes-just-doesn't-happen complaint). Give the
    // long-press specifically a more forgiving budget; real scroll gestures
    // move far more than this well before 500ms is up, so it doesn't hurt
    // scroll-vs-hold discrimination.
    private final float longPressCancelSlopPx;
    private final float handleRadiusPx;
    private final float handleTouchRadiusPx;

    private float downX, downY;
    private boolean longPressFired = false;
    private boolean draggingStartHandle = false;
    private boolean draggingEndHandle = false;
    private final Runnable longPressRunnable = new Runnable() {
        @Override
        public void run() {
            longPressFired = true;
            if (pdfView != null) {
                MotionEvent cancel = MotionEvent.obtain(
                        System.currentTimeMillis(), System.currentTimeMillis(),
                        MotionEvent.ACTION_CANCEL, downX, downY, 0);
                pdfView.dispatchTouchEvent(cancel);
                cancel.recycle();
            }
            startSelectionAt(downX, downY);
        }
    };

    private boolean hasSelection = false;
    private int selPage = -1;
    private int selStart = -1; // inclusive char index into textLayouts.get(selPage).chars
    private int selEnd = -1;   // inclusive, selEnd >= selStart
    // Which end follows the finger for the remainder of the current gesture --
    // set on long-press (moving = far/end side) and on grabbing a handle.
    private int anchorIdx = -1;
    private int movingIdx = -1;

    private final Paint highlightPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint handlePaint = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final RectF startHandleHit = new RectF();
    private final RectF endHandleHit = new RectF();

    // Highlights the person has committed (tapped "Highlight" on), kept
    // on screen for the rest of this viewing session so the color change is
    // visible immediately -- e.g. to screenshot -- rather than only existing
    // in the separate saved copy. {page, startCharIdx, endCharIdx} per entry,
    // redrawn every frame from the same PDF-point boxes as the live
    // selection tint, so they track scroll/zoom/rotate correctly. Screen-only:
    // has no effect on the actual saved PDF, which PdfViewerActivity writes
    // separately.
    private final List<int[]> committedHighlights = new ArrayList<>();
    private final Paint committedHighlightPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint searchMatchPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint searchActivePaint = new Paint(Paint.ANTI_ALIAS_FLAG);

    // PDFView scrolls/zooms/flings by animating its own currentXOffset/
    // currentYOffset/zoom fields and redrawing itself -- it does NOT use
    // View's built-in scroll mechanism, so there's no scroll callback this
    // sibling view can register for. Instead, piggyback on every draw pass
    // of the window (which PDFView's own animation already triggers each
    // frame while moving) and re-invalidate ourselves only when PDFView's
    // offset/zoom actually changed since the last frame we drew -- otherwise
    // a committed highlight would stay frozen at wherever it was drawn at
    // commit time instead of tracking the page during a later, unrelated
    // scroll gesture. The dirty-check is what keeps this from becoming an
    // infinite per-frame redraw loop while nothing is actually moving.
    private float lastSyncXOffset = Float.NaN, lastSyncYOffset = Float.NaN, lastSyncZoom = Float.NaN;
    private final ViewTreeObserver.OnDrawListener scrollSyncListener = new ViewTreeObserver.OnDrawListener() {
        @Override
        public void onDraw() {
            boolean hasSearch = searchRanges != null && !searchRanges.isEmpty();
            if (pdfView == null || (!hasSelection && committedHighlights.isEmpty() && !hasSearch)) return;
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

    public PdfTextSelectionOverlayView(Context context, AttributeSet attrs) {
        super(context, attrs);
        longPressTimeoutMs = ViewConfiguration.getLongPressTimeout();
        float density = context.getResources().getDisplayMetrics().density;
        longPressCancelSlopPx = 18f * density;
        handleRadiusPx = 6f * density;
        handleTouchRadiusPx = 24f * density;

        highlightPaint.setStyle(Paint.Style.FILL);
        highlightPaint.setColor(Color.argb(90, 51, 153, 255));

        handlePaint.setStyle(Paint.Style.FILL);
        handlePaint.setColor(Color.parseColor("#3399FF"));

        // Real highlighter-marker yellow, more opaque than the in-progress
        // (blue) selection tint above so a committed highlight reads as
        // "done" at a glance.
        committedHighlightPaint.setStyle(Paint.Style.FILL);
        committedHighlightPaint.setColor(Color.argb(140, 255, 235, 59));

        // Search hits are amber; the one prev/next is currently on is a
        // stronger orange, so "where am I in the results" is visible at a
        // glance. Deliberately not the highlighter yellow above -- a search
        // hit is transient and mustn't be mistaken for a saved highlight.
        searchMatchPaint.setStyle(Paint.Style.FILL);
        searchMatchPaint.setColor(Color.argb(110, 255, 193, 7));
        searchActivePaint.setStyle(Paint.Style.FILL);
        searchActivePaint.setColor(Color.argb(190, 255, 138, 0));
    }

    public void setPdfView(PDFView pdfView) {
        this.pdfView = pdfView;
    }

    // ============================================================
    // SEARCH MATCH HIGHLIGHTING
    // ============================================================
    // Search used to be page-level only: it jumped to the page and left the
    // reader to find the word themselves, which reads as "search is broken"
    // even though it isn't. These are the char-index ranges of every
    // occurrence on one page, resolved by PdfViewerActivity against the same
    // CharBox layout selection already uses, so no new geometry is needed.

    private int searchPage = -1;
    private List<int[]> searchRanges = null;   // {startCharIdx, endCharIdxInclusive}
    // A hit's own box, sent with the match itself. It lets the highlight appear
    // the moment the viewer jumps, without waiting for the page's full
    // character map -- which during a long scan can be many seconds away.
    private int quickPage = -1;
    private RectF quickRect = null;            // PDF points, top-left origin
    private float quickPageW, quickPageH;
    private int activeSearchRange = -1;        // the one prev/next is sitting on

    public void setQuickSearchRect(int page, float x, float y, float w, float h, float pageW, float pageH) {
        quickPage = page;
        quickRect = new RectF(x, y, x + w, y + h);
        quickPageW = pageW;
        quickPageH = pageH;
        searchPage = page;
        invalidate();
    }

    public void setSearchMatches(int page, List<int[]> ranges, int activeIndex) {
        this.searchPage = page;
        this.searchRanges = ranges;
        this.activeSearchRange = activeIndex;
        invalidate();
    }

    public void clearSearchMatches() {
        if (searchRanges == null && searchPage < 0) return;
        searchPage = -1;
        searchRanges = null;
        quickRect = null;
        quickPage = -1;
        activeSearchRange = -1;
        invalidate();
    }

    // Screen rect covering one match, or null. Used both for drawing and by
    // the activity to work out how far to scroll.
    public RectF searchMatchRect(int rangeIndex) {
        if (searchRanges == null || searchRanges.isEmpty()) return quickSearchRect();
        if (rangeIndex < 0 || rangeIndex >= searchRanges.size()) return null;
        if (textLayouts == null || searchPage < 0 || searchPage >= textLayouts.size()) return null;
        RectF pageRect = pageScreenRect(searchPage);
        PdfViewerActivity.PageTextLayout layout = textLayouts.get(searchPage);
        if (pageRect == null || layout == null) return null;
        int[] range = searchRanges.get(rangeIndex);
        RectF union = null;
        int hi = Math.min(range[1], layout.chars.size() - 1);
        for (int i = Math.max(0, range[0]); i <= hi; i++) {
            RectF r = charScreenRect(pageRect, layout, layout.chars.get(i));
            if (r == null) continue;
            if (union == null) union = new RectF(r);
            else union.union(r);
        }
        return union;
    }

    // The hit's own box, mapped onto the page as it is drawn right now.
    private RectF quickSearchRect() {
        if (quickRect == null || quickPage < 0 || quickPageW <= 0 || quickPageH <= 0) return null;
        RectF pageRect = pageScreenRect(quickPage);
        if (pageRect == null) return null;
        float sx = pageRect.width() / quickPageW;
        float sy = pageRect.height() / quickPageH;
        return new RectF(pageRect.left + quickRect.left * sx, pageRect.top + quickRect.top * sy,
                pageRect.left + quickRect.right * sx, pageRect.top + quickRect.bottom * sy);
    }

    private void drawSearchMatches(Canvas canvas) {
        if (searchRanges == null || searchRanges.isEmpty()) {
            RectF q = quickSearchRect();
            if (q != null && q.height() > 0) {
                float h = q.height();
                canvas.drawRoundRect(new RectF(q.left - h * 0.12f, q.top - h * 0.28f,
                                q.right + h * 0.12f, q.bottom + h * 0.10f),
                        h * 0.22f, h * 0.22f, searchActivePaint);
            }
            return;
        }
        if (textLayouts == null || searchPage < 0 || searchPage >= textLayouts.size()) return;
        RectF pageRect = pageScreenRect(searchPage);
        PdfViewerActivity.PageTextLayout layout = textLayouts.get(searchPage);
        if (pageRect == null || layout == null) return;

        for (int m = 0; m < searchRanges.size(); m++) {
            RectF r = searchMatchRect(m);
            if (r == null || r.height() <= 0) continue;
            Paint paint = (m == activeSearchRange) ? searchActivePaint : searchMatchPaint;
            // PDFBox glyph boxes are shorter than the capitals and overlap at
            // the seams, so one per-character rect sat low and striped. One
            // padded box per match covers the whole word cleanly.
            float h = r.height();
            RectF box = new RectF(r.left - h * 0.12f, r.top - h * 0.28f, r.right + h * 0.12f, r.bottom + h * 0.10f);
            canvas.drawRoundRect(box, h * 0.22f, h * 0.22f, paint);
        }
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

    public void setOnSelectionListener(OnSelectionListener listener) {
        this.listener = listener;
    }

    public void setMarkModeActive(boolean active) {
        this.markModeActive = active;
    }

    // Called once per document load, after ensurePageTextLayoutExtracted()'s
    // background pass finishes. Resets any precomputed geometry -- a new
    // document means new page sizes.
    public void setTextLayouts(List<PdfViewerActivity.PageTextLayout> layouts) {
        this.textLayouts = layouts;
        this.geometryReady = false;
        clearSelection();
    }

    public boolean hasSelection() {
        return hasSelection;
    }

    // Raw selection range, for callers (PdfViewerActivity) that need to do
    // more with the selected characters than just read the joined text --
    // e.g. building highlight QuadPoints from their PDF-point boxes.
    public int getSelectionPage() {
        return selPage;
    }

    public int getSelectionStart() {
        return selStart;
    }

    public int getSelectionEnd() {
        return selEnd;
    }

    // Plain-text join of the selected characters, in PDFBox reading order --
    // no attempt to reinsert line breaks between wrapped lines.
    public String getSelectedText() {
        if (!hasSelection || selPage < 0 || textLayouts == null || selPage >= textLayouts.size()) {
            return "";
        }
        List<PdfViewerActivity.CharBox> chars = textLayouts.get(selPage).chars;
        StringBuilder sb = new StringBuilder();
        for (int i = selStart; i <= selEnd && i < chars.size(); i++) {
            String ch = chars.get(i).ch;
            if (ch != null) sb.append(ch);
        }
        return sb.toString();
    }

    public void clearSelection() {
        boolean had = hasSelection;
        hasSelection = false;
        selPage = -1;
        selStart = -1;
        selEnd = -1;
        invalidate();
        if (had && listener != null) {
            listener.onSelectionChanged(false, 0, 0);
        }
    }

    // Turns the current (blue, in-progress) selection into a permanent
    // (yellow) on-screen highlight, then clears the selection UI the same
    // way clearSelection() does. Call this instead of clearSelection() from
    // the Highlight button so the color change is visible right away instead
    // of only existing in the copy PdfViewerActivity saves in the background.
    public void commitHighlight() {
        if (hasSelection && selPage >= 0) {
            committedHighlights.add(new int[]{selPage, selStart, selEnd});
        }
        clearSelection();
    }

    public boolean hasCommittedHighlights() {
        return !committedHighlights.isEmpty();
    }

    // Copy, not the live list -- caller (PdfViewerActivity, saving these into
    // the PDF on exit) shouldn't be able to mutate this view's own state.
    public List<int[]> getCommittedHighlights() {
        return new ArrayList<>(committedHighlights);
    }

    // ============================================================
    // GEOMETRY -- reconstructs PdfFile's page-offset math from PDFView's
    // public API (see this class's header comment for why it can't just call
    // the library's own version of this).
    // ============================================================

    private void ensureGeometryReady() {
        if (geometryReady || pdfView == null || textLayouts == null) return;
        int count = textLayouts.size();
        cumulativeRawOffsets = new float[count];
        boolean vertical = pdfView.isSwipeVertical();
        float spacing = pdfView.getSpacingPx();
        float offset = 0f;
        for (int i = 0; i < count; i++) {
            cumulativeRawOffsets[i] = offset;
            SizeF size = pdfView.getPageSize(i);
            if (size == null) continue;
            offset += (vertical ? size.getHeight() : size.getWidth()) + spacing;
            maxPageWidthAtZoom1 = Math.max(maxPageWidthAtZoom1, size.getWidth());
            maxPageHeightAtZoom1 = Math.max(maxPageHeightAtZoom1, size.getHeight());
        }
        geometryReady = true;
    }

    // On-screen rect of a whole page (this view's local coordinate space,
    // which is identical to pdfView's -- both are match_parent siblings
    // inside the same pdfContainer with no relative translation of their
    // own; only pdfContainer's Rotate transform applies, equally, to both).
    private RectF pageScreenRect(int pageIndex) {
        ensureGeometryReady();
        if (!geometryReady || pageIndex < 0 || pageIndex >= cumulativeRawOffsets.length) return null;
        boolean vertical = pdfView.isSwipeVertical();
        float zoom = pdfView.getZoom();
        SizeF size = pdfView.getPageSize(pageIndex);
        if (size == null) return null;

        float primaryPx = cumulativeRawOffsets[pageIndex] * zoom;
        float secondaryPx = vertical
                ? zoom * (maxPageWidthAtZoom1 - size.getWidth()) / 2f
                : zoom * (maxPageHeightAtZoom1 - size.getHeight()) / 2f;

        float left, top;
        if (vertical) {
            left = pdfView.getCurrentXOffset() + secondaryPx;
            top = pdfView.getCurrentYOffset() + primaryPx;
        } else {
            left = pdfView.getCurrentXOffset() + primaryPx;
            top = pdfView.getCurrentYOffset() + secondaryPx;
        }
        float w = size.getWidth() * zoom;
        float h = size.getHeight() * zoom;
        return new RectF(left, top, left + w, top + h);
    }

    // Maps one PDFBox CharBox (raw PDF-point space, top-left origin -- see
    // PdfViewerActivity.CharBox) onto this view's screen coordinates, given
    // the page's own on-screen rect and its PDF-point display size.
    private RectF charScreenRect(RectF pageRect, PdfViewerActivity.PageTextLayout layout, PdfViewerActivity.CharBox c) {
        if (layout.pageWidthPts <= 0 || layout.pageHeightPts <= 0) return null;
        float scaleX = pageRect.width() / layout.pageWidthPts;
        float scaleY = pageRect.height() / layout.pageHeightPts;
        float left = pageRect.left + c.x * scaleX;
        float top = pageRect.top + c.y * scaleY;
        return new RectF(left, top, left + c.width * scaleX, top + c.height * scaleY);
    }

    // Nearest character (by box-center distance) to a screen point, or -1.
    // Restricted to a single page -- the one whose screen rect contains the
    // point, falling back to the currently-active page (v1 simplification;
    // selection doesn't span pages).
    private int resolvePageForPoint(float x, float y) {
        if (textLayouts == null || pdfView == null) return -1;
        int current = pdfView.getCurrentPage();
        for (int p = Math.max(0, current - 1); p <= Math.min(textLayouts.size() - 1, current + 1); p++) {
            RectF r = pageScreenRect(p);
            if (r != null && r.contains(x, y)) return p;
        }
        return (current >= 0 && current < textLayouts.size()) ? current : -1;
    }

    private int nearestCharIndex(int page, float screenX, float screenY) {
        if (textLayouts == null || page < 0 || page >= textLayouts.size()) return -1;
        RectF pageRect = pageScreenRect(page);
        PdfViewerActivity.PageTextLayout layout = textLayouts.get(page);
        if (pageRect == null || layout == null || layout.chars.isEmpty()) return -1;

        int best = -1;
        float bestDist = Float.MAX_VALUE;
        for (int i = 0; i < layout.chars.size(); i++) {
            RectF r = charScreenRect(pageRect, layout, layout.chars.get(i));
            if (r == null) continue;
            float cx = r.centerX(), cy = r.centerY();
            float dx = screenX - cx, dy = screenY - cy;
            float dist = dx * dx + dy * dy;
            if (dist < bestDist) {
                bestDist = dist;
                best = i;
            }
        }
        return best;
    }

    private boolean isWordBoundary(String ch) {
        return ch == null || ch.trim().isEmpty();
    }

    // Word-select needs to stop at more than just literal whitespace
    // characters. PDFTextStripper inserts a synthetic space into the plain
    // *text string* it builds whenever it sees a gap between glyphs, but
    // that synthetic space has no TextPosition of its own -- so it never
    // makes it into layout.chars (built purely from real TextPositions, see
    // PdfViewerActivity.ensurePageTextLayoutForPage). Two disconnected
    // runs (e.g. neighbouring cells in a table of contents, each its own
    // BT/ET text-showing op with no actual space glyph between them) end up
    // sitting flush against each other in layout.chars with nothing marking
    // the seam -- word-select would otherwise walk straight through and
    // swallow the whole row/column. Fall back to a position-based check:
    // either character being real whitespace, a line change, or a gap wider
    // than roughly one glyph all count as a boundary too.
    private boolean isBoundaryBetween(PdfViewerActivity.CharBox a, PdfViewerActivity.CharBox b) {
        // OCR entries are already whole words (see CharBox.wholeUnit's own
        // comment) -- never merge two of them into one "word" on a tap, or
        // a single tap on a scanned page would select the whole line.
        // Dragging a handle to extend across further OCR words still works
        // fine regardless, since that path picks the nearest unit directly
        // rather than walking boundaries.
        if (a.wholeUnit || b.wholeUnit) return true;
        if (isWordBoundary(a.ch) || isWordBoundary(b.ch)) return true;
        float refSize = Math.max(Math.max(a.height, b.height), 1f);
        if (Math.abs(a.y - b.y) > refSize * 0.5f) return true; // wrapped to a new line
        float gap = b.x - (a.x + a.width);
        // pdfium's boxes hug the ink, so a narrow glyph like "1" sits well
        // inside its advance and left a gap past half the height: long-press
        // on "117818" selected only "17818". Real word breaks come through
        // as space characters (checked above); this only has to catch runs
        // with no space glyph at all, such as separate table columns.
        return gap > refSize; // disconnected run, no shared space glyph
    }

    // Exposed so PdfViewerActivity can re-run the same long-press once it's
    // finished lazily extracting a page that wasn't ready the first time
    // (see OnSelectionListener.onPageTextNeeded below).
    public void retrySelectionAt(float screenX, float screenY) {
        retryingSelection = true;
        try {
            startSelectionAt(screenX, screenY);
        } finally {
            retryingSelection = false;
        }
    }

    private boolean retryingSelection = false;

    // The nearest character can be anywhere on the page. On a drawing with
    // only a title block as real text, a press on a label used to "select"
    // that far-away title, off screen, so nothing seemed to happen.
    private boolean isNearTouch(int page, int idx, float screenX, float screenY) {
        RectF pageRect = pageScreenRect(page);
        PdfViewerActivity.PageTextLayout layout = textLayouts.get(page);
        if (pageRect == null || layout == null || idx < 0 || idx >= layout.chars.size()) return false;
        RectF r = charScreenRect(pageRect, layout, layout.chars.get(idx));
        if (r == null) return false;
        float reach = Math.max(longPressCancelSlopPx * 2.5f, r.height() * 2f);
        float dx = Math.max(0f, Math.max(r.left - screenX, screenX - r.right));
        float dy = Math.max(0f, Math.max(r.top - screenY, screenY - r.bottom));
        return dx * dx + dy * dy <= reach * reach;
    }

    private void startSelectionAt(float screenX, float screenY) {
        int page = resolvePageForPoint(screenX, screenY);
        if (page < 0 || textLayouts == null || page >= textLayouts.size()) return;

        if (textLayouts.get(page) == null) {
            // Not extracted yet -- ask PdfViewerActivity to do that one page
            // lazily and come back to retrySelectionAt() rather than
            // silently giving up (the old whole-document-up-front approach
            // is exactly what made long-press do nothing on large PDFs).
            if (listener != null) listener.onPageTextNeeded(page, screenX, screenY);
            return;
        }

        int hit = nearestCharIndex(page, screenX, screenY);
        if (hit < 0 || !isNearTouch(page, hit, screenX, screenY)) {
            if (listener == null) return;
            // First miss: let the viewer re-read the page (this is where OCR
            // runs for a page whose text is drawn as lines), then retry once.
            if (!retryingSelection) listener.onPageTextNeeded(page, screenX, screenY);
            else listener.onNoTextAt(page);
            return;
        }

        List<PdfViewerActivity.CharBox> chars = textLayouts.get(page).chars;
        int start = hit, end = hit;
        while (start > 0 && !isBoundaryBetween(chars.get(start - 1), chars.get(start))) start--;
        while (end < chars.size() - 1 && !isBoundaryBetween(chars.get(end), chars.get(end + 1))) end++;

        selPage = page;
        selStart = start;
        selEnd = end;
        anchorIdx = start;
        movingIdx = end;
        hasSelection = true;
        performHapticFeedback(HapticFeedbackConstants.LONG_PRESS);
        reportSelectionAnchor();
        invalidate();
    }

    private void updateMovingHandle(float screenX, float screenY) {
        if (selPage < 0) return;
        int idx = nearestCharIndex(selPage, screenX, screenY);
        if (idx < 0) return;
        movingIdx = idx;
        selStart = Math.min(anchorIdx, movingIdx);
        selEnd = Math.max(anchorIdx, movingIdx);
        invalidate();
    }

    private void reportSelectionAnchor() {
        if (listener == null || selPage < 0) return;
        RectF pageRect = pageScreenRect(selPage);
        PdfViewerActivity.PageTextLayout layout = textLayouts.get(selPage);
        if (pageRect == null || selStart >= layout.chars.size()) return;
        RectF first = charScreenRect(pageRect, layout, layout.chars.get(selStart));
        if (first == null) return;
        listener.onSelectionChanged(true, first.left, first.top);
    }

    // ============================================================
    // DRAWING
    // ============================================================

    @Override
    protected void onDraw(Canvas canvas) {
        super.onDraw(canvas);
        drawCommittedHighlights(canvas);
        drawSearchMatches(canvas);

        if (!hasSelection || selPage < 0 || textLayouts == null || selPage >= textLayouts.size()) return;

        RectF pageRect = pageScreenRect(selPage);
        PdfViewerActivity.PageTextLayout layout = textLayouts.get(selPage);
        if (pageRect == null || layout == null) return;
        List<PdfViewerActivity.CharBox> chars = layout.chars;

        RectF firstRect = null, lastRect = null;
        int hi = Math.min(selEnd, chars.size() - 1);
        for (int i = selStart; i <= hi; i++) {
            RectF r = charScreenRect(pageRect, layout, chars.get(i));
            if (r == null) continue;
            canvas.drawRect(r, highlightPaint);
            if (firstRect == null) firstRect = r;
            lastRect = r;
        }

        if (firstRect != null) {
            canvas.drawCircle(firstRect.left, firstRect.bottom, handleRadiusPx, handlePaint);
            startHandleHit.set(firstRect.left - handleTouchRadiusPx, firstRect.bottom - handleTouchRadiusPx,
                    firstRect.left + handleTouchRadiusPx, firstRect.bottom + handleTouchRadiusPx);
        }
        if (lastRect != null) {
            canvas.drawCircle(lastRect.right, lastRect.bottom, handleRadiusPx, handlePaint);
            endHandleHit.set(lastRect.right - handleTouchRadiusPx, lastRect.bottom - handleTouchRadiusPx,
                    lastRect.right + handleTouchRadiusPx, lastRect.bottom + handleTouchRadiusPx);
        }
    }

    private void drawCommittedHighlights(Canvas canvas) {
        if (textLayouts == null || committedHighlights.isEmpty()) return;
        for (int[] h : committedHighlights) {
            int page = h[0], start = h[1], end = h[2];
            if (page < 0 || page >= textLayouts.size()) continue;
            RectF pageRect = pageScreenRect(page);
            PdfViewerActivity.PageTextLayout layout = textLayouts.get(page);
            if (pageRect == null || layout == null) continue;
            int hi = Math.min(end, layout.chars.size() - 1);
            for (int i = start; i <= hi; i++) {
                RectF r = charScreenRect(pageRect, layout, layout.chars.get(i));
                if (r != null) canvas.drawRect(r, committedHighlightPaint);
            }
        }
    }

    // ============================================================
    // TOUCH -- see class header comment for the overall model.
    // ============================================================

    private void forwardToPdfView(MotionEvent event) {
        if (pdfView != null) pdfView.dispatchTouchEvent(event);
    }

    @Override
    public boolean onTouchEvent(MotionEvent event) {
        if (pdfView == null || markModeActive) return false;
        if (textLayouts == null) {
            if (event.getActionMasked() == MotionEvent.ACTION_DOWN && listener != null) {
                listener.onTextNotReady();
            }
            return false;
        }

        // Lifting one finger of a pinch leaves the other one down, and the
        // viewer treats that as the start of a drag -- so the area just zoomed
        // into jerks sideways by however much that finger wobbles. Once a pinch
        // has happened, no more movement is passed on until every finger is up.
        switch (event.getActionMasked()) {
            case MotionEvent.ACTION_POINTER_DOWN:
                pinchInProgress = true;
                break;
            case MotionEvent.ACTION_POINTER_UP:
                if (pinchInProgress) suppressDragUntilUp = true;
                break;
        }

        switch (event.getActionMasked()) {
            case MotionEvent.ACTION_DOWN: {
                pinchInProgress = false;
                suppressDragUntilUp = false;
                downX = event.getX();
                downY = event.getY();
                longPressFired = false;
                draggingStartHandle = hasSelection && startHandleHit.contains(downX, downY);
                draggingEndHandle = !draggingStartHandle && hasSelection && endHandleHit.contains(downX, downY);

                if (draggingStartHandle) {
                    anchorIdx = selEnd;
                    movingIdx = selStart;
                } else if (draggingEndHandle) {
                    anchorIdx = selStart;
                    movingIdx = selEnd;
                } else {
                    if (hasSelection) clearSelection();
                    forwardToPdfView(event);
                    postDelayed(longPressRunnable, longPressTimeoutMs);
                }
                return true;
            }

            case MotionEvent.ACTION_MOVE: {
                if (suppressDragUntilUp) return true;   // tail of a pinch
                if (draggingStartHandle || draggingEndHandle || longPressFired) {
                    updateMovingHandle(event.getX(), event.getY());
                    return true;
                }
                if (Math.abs(event.getX() - downX) > longPressCancelSlopPx || Math.abs(event.getY() - downY) > longPressCancelSlopPx) {
                    removeCallbacks(longPressRunnable);
                }
                forwardToPdfView(event);
                return true;
            }

            case MotionEvent.ACTION_UP:
            case MotionEvent.ACTION_CANCEL: {
                removeCallbacks(longPressRunnable);
                pinchInProgress = false;
                suppressDragUntilUp = false;
                boolean wasCommitted = draggingStartHandle || draggingEndHandle || longPressFired;
                draggingStartHandle = false;
                draggingEndHandle = false;
                if (wasCommitted) {
                    if (hasSelection) reportSelectionAnchor();
                } else {
                    forwardToPdfView(event);
                }
                return true;
            }

            default:
                return false;
        }
    }
}
