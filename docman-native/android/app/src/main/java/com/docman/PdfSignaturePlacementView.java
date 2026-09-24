// FILE LOCATION:
// android/app/src/main/java/com/oarcel/docman/PdfSignaturePlacementView.java

package com.docman;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.RectF;
import android.util.AttributeSet;
import android.view.MotionEvent;
import android.view.ScaleGestureDetector;
import android.view.View;

import com.github.barteksc.pdfviewer.PDFView;
import com.shockwave.pdfium.util.SizeF;

// Screen-space overlay for dragging/pinch-resizing a drawn signature into
// place before PdfViewerActivity stamps it into the PDF. Sibling to the
// other overlays in pdfContainer (see activity_pdf_viewer.xml).
//
// Unlike PdfTextSelectionOverlayView, this one can just claim every touch
// outright while active: PdfViewerActivity disables PDFView's own
// swipe/pinch for the duration (the same pdfView.setSwipeEnabled(false)
// trick Mark mode already uses), so there's no sibling-view gesture
// arbitration to solve here -- one less large source of risk for a feature
// that, like Mark and text selection, has no engine-level support to lean
// on and has to reconstruct pdfium's page geometry by hand.
public class PdfSignaturePlacementView extends View {

    private PDFView pdfView;
    private boolean active = false;
    private Bitmap signatureBitmap;
    private final RectF placementRect = new RectF();
    private final Paint borderPaint = new Paint(Paint.ANTI_ALIAS_FLAG);

    private final ScaleGestureDetector scaleDetector;
    private float dragLastX, dragLastY;
    private boolean dragging = false;

    public PdfSignaturePlacementView(Context context, AttributeSet attrs) {
        super(context, attrs);
        borderPaint.setStyle(Paint.Style.STROKE);
        borderPaint.setStrokeWidth(2f * context.getResources().getDisplayMetrics().density);
        borderPaint.setColor(Color.parseColor("#3399FF"));

        scaleDetector = new ScaleGestureDetector(context, new ScaleGestureDetector.SimpleOnScaleGestureListener() {
            @Override
            public boolean onScale(ScaleGestureDetector detector) {
                float factor = detector.getScaleFactor();
                float cx = placementRect.centerX(), cy = placementRect.centerY();
                float newW = placementRect.width() * factor;
                float newH = placementRect.height() * factor;
                float minSize = 24f * getResources().getDisplayMetrics().density;
                if (newW < minSize || newH < minSize) return true;
                placementRect.set(cx - newW / 2f, cy - newH / 2f, cx + newW / 2f, cy + newH / 2f);
                invalidate();
                return true;
            }
        });
    }

    public void setPdfView(PDFView pdfView) {
        this.pdfView = pdfView;
    }

    // Starts placement centered on screen, sized to a reasonable default
    // width while preserving the drawn signature's own aspect ratio.
    public void startPlacement(Bitmap bitmap) {
        signatureBitmap = bitmap;
        active = true;
        float targetW = getWidth() * 0.5f;
        float aspect = bitmap.getHeight() / (float) bitmap.getWidth();
        float targetH = targetW * aspect;
        float cx = getWidth() / 2f, cy = getHeight() / 2f;
        placementRect.set(cx - targetW / 2f, cy - targetH / 2f, cx + targetW / 2f, cy + targetH / 2f);
        invalidate();
    }

    public void cancelPlacement() {
        active = false;
        signatureBitmap = null;
        invalidate();
    }

    public boolean isActive() {
        return active;
    }

    public Bitmap getSignatureBitmap() {
        return signatureBitmap;
    }

    // ============================================================
    // GEOMETRY -- same proven formula as PdfTextSelectionOverlayView's
    // pageScreenRect() (see that class's header comment for the full
    // derivation of why pdfium's page-offset math has to be reconstructed
    // by hand here at all). Duplicated rather than shared: small,
    // self-contained, and this view has no other dependency on that class.
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

    // Converts the current placement rect into fractions (0..1) of the
    // current page's own on-screen box, top-down -- resolution-independent,
    // so PdfViewerActivity can turn it into absolute PDF points once it
    // knows the page's real point size (only available once the document is
    // open for stamping). {page, fracLeft, fracTop, fracWidth, fracHeight},
    // or null if geometry isn't available right now.
    public float[] getNormalizedPlacement() {
        if (pdfView == null) return null;
        int page = pdfView.getCurrentPage();
        RectF pageRect = pageScreenRect(page);
        if (pageRect == null || pageRect.width() <= 0 || pageRect.height() <= 0) return null;
        float fracLeft = (placementRect.left - pageRect.left) / pageRect.width();
        float fracTop = (placementRect.top - pageRect.top) / pageRect.height();
        float fracW = placementRect.width() / pageRect.width();
        float fracH = placementRect.height() / pageRect.height();
        return new float[]{page, fracLeft, fracTop, fracW, fracH};
    }

    @Override
    protected void onDraw(Canvas canvas) {
        super.onDraw(canvas);
        if (!active || signatureBitmap == null) return;
        canvas.drawBitmap(signatureBitmap, null, placementRect, null);
        canvas.drawRect(placementRect, borderPaint);
    }

    @Override
    public boolean onTouchEvent(MotionEvent event) {
        if (!active) return false;
        scaleDetector.onTouchEvent(event);

        switch (event.getActionMasked()) {
            case MotionEvent.ACTION_DOWN:
                dragLastX = event.getX();
                dragLastY = event.getY();
                dragging = placementRect.contains(dragLastX, dragLastY);
                return true;
            case MotionEvent.ACTION_MOVE:
                if (dragging && !scaleDetector.isInProgress()) {
                    float dx = event.getX() - dragLastX;
                    float dy = event.getY() - dragLastY;
                    placementRect.offset(dx, dy);
                    dragLastX = event.getX();
                    dragLastY = event.getY();
                    invalidate();
                }
                return true;
            case MotionEvent.ACTION_UP:
            case MotionEvent.ACTION_CANCEL:
                dragging = false;
                return true;
            default:
                return false;
        }
    }
}
