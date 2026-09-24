// FILE LOCATION:
// android/app/src/main/java/com/oarcel/docman/PdfCropOverlayView.java

package com.docman;

import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.RectF;
import android.util.AttributeSet;
import android.view.MotionEvent;
import android.view.View;

import com.github.barteksc.pdfviewer.PDFView;
import com.shockwave.pdfium.util.SizeF;

// Screen-space overlay for marking ONE rectangular area to keep on the
// current page. Same one-shot drag-a-shape-then-auto-exit gesture as
// PdfRedactOverlayView (see that class's header comment for the reasoning),
// minus the "keep a persistent marker after commit" machinery -- unlike
// Redact, a crop doesn't change what's on screen right now (the saved copy
// is a brand new, smaller-paged file elsewhere), so there's nothing on THIS
// page to keep drawing once the mode exits.
//
// Stroke-only, no fill: the whole point is to see what stays inside the box
// against the real page content, not to obscure it the way Redact's opaque
// fill intentionally does.
public class PdfCropOverlayView extends View {

    public interface OnCropAreaListener {
        void onCropAreaMarked();
    }

    private PDFView pdfView;
    private boolean modeEnabled = false;
    private RectF activeRect = null;
    private RectF confirmedRect = null;
    private float startX, startY;
    private OnCropAreaListener listener;

    private final Paint strokePaint = new Paint(Paint.ANTI_ALIAS_FLAG);

    public PdfCropOverlayView(Context context, AttributeSet attrs) {
        super(context, attrs);
        strokePaint.setStyle(Paint.Style.STROKE);
        strokePaint.setStrokeWidth(3f * context.getResources().getDisplayMetrics().density);
        strokePaint.setColor(Color.parseColor("#A78BFA"));
    }

    public void setPdfView(PDFView pdfView) {
        this.pdfView = pdfView;
    }

    public void setOnCropAreaListener(OnCropAreaListener l) {
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

    // Called when the person cancels the confirmation instead of cropping
    // -- discards the marked box.
    public void clearConfirmedRect() {
        confirmedRect = null;
        invalidate();
    }

    @Override
    protected void onDraw(Canvas canvas) {
        super.onDraw(canvas);
        if (activeRect != null) {
            canvas.drawRect(activeRect, strokePaint);
        }
        if (confirmedRect != null) {
            canvas.drawRect(confirmedRect, strokePaint);
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
                        if (listener != null) listener.onCropAreaMarked();
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
    // PdfTextSelectionOverlayView/PdfSignaturePlacementView/
    // PdfRedactOverlayView (see any of those classes for the derivation).
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
    // PdfRedactOverlayView.getNormalizedRedactArea().
    public float[] getNormalizedCropArea() {
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
