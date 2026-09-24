// FILE LOCATION:
// android/app/src/main/java/com/oarcel/docman/PdfMarkOverlayView.java

package com.docman;

import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.RectF;
import android.util.AttributeSet;
import android.view.MotionEvent;
import android.view.View;

import java.util.ArrayList;
import java.util.List;

// Lightweight screen-space overlay for circling a spot on the page before
// taking a screenshot (e.g. "look at this component/terminal"). Marks are
// purely visual -- NOT saved into the PDF file and not persisted anywhere.
// They stay put on screen; if you scroll or zoom afterward they won't follow
// the page content, so draw the mark right before you screenshot.
//
// Mark mode allows exactly ONE mark per activation: after a mark is drawn,
// mode auto-disables (see ACTION_UP below) so further touches scroll/pan the
// PDF normally instead of drawing another circle. Tap the mark button again
// to draw a new one. Long-press the mark button clears any marks drawn.
//
// When mark mode is OFF this view consumes nothing (onTouchEvent returns
// false), so touches fall straight through to the PDFView underneath and
// scrolling/zoom/pinch all work exactly as before.
public class PdfMarkOverlayView extends View {

    // Fired right after a mark is successfully added (see the one-mark-only
    // behavior in onTouchEvent below) so the hosting Activity can flip its
    // mark-button icon back to the inactive color -- this view has no
    // reference to that button itself.
    public interface OnMarkAddedListener {
        void onMarkAdded();
    }

    private boolean markModeEnabled = false;
    private final List<RectF> marks = new ArrayList<>();
    private RectF activeMark = null;
    private float startX, startY;
    private OnMarkAddedListener onMarkAddedListener;

    private final Paint strokePaint = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint fillPaint = new Paint(Paint.ANTI_ALIAS_FLAG);

    public PdfMarkOverlayView(Context context, AttributeSet attrs) {
        super(context, attrs);
        strokePaint.setStyle(Paint.Style.STROKE);
        strokePaint.setStrokeWidth(6f);
        strokePaint.setColor(Color.parseColor("#FF4444"));

        fillPaint.setStyle(Paint.Style.FILL);
        fillPaint.setColor(Color.argb(40, 255, 68, 68));
    }

    public void setOnMarkAddedListener(OnMarkAddedListener listener) {
        this.onMarkAddedListener = listener;
    }

    public void setMarkModeEnabled(boolean enabled) {
        this.markModeEnabled = enabled;
    }

    public boolean isMarkModeEnabled() {
        return markModeEnabled;
    }

    public boolean hasMarks() {
        return !marks.isEmpty();
    }

    public void clearMarks() {
        marks.clear();
        activeMark = null;
        invalidate();
    }

    @Override
    protected void onDraw(Canvas canvas) {
        super.onDraw(canvas);
        for (RectF r : marks) {
            canvas.drawOval(r, fillPaint);
            canvas.drawOval(r, strokePaint);
        }
        if (activeMark != null) {
            canvas.drawOval(activeMark, fillPaint);
            canvas.drawOval(activeMark, strokePaint);
        }
    }

    @Override
    public boolean onTouchEvent(MotionEvent event) {
        if (!markModeEnabled) {
            return false; // let the touch fall through to the PDF view below
        }
        switch (event.getAction()) {
            case MotionEvent.ACTION_DOWN:
                startX = event.getX();
                startY = event.getY();
                activeMark = new RectF(startX, startY, startX, startY);
                invalidate();
                return true;

            case MotionEvent.ACTION_MOVE:
                if (activeMark != null) {
                    updateActiveMark(event.getX(), event.getY());
                    invalidate();
                }
                return true;

            case MotionEvent.ACTION_UP:
            case MotionEvent.ACTION_CANCEL:
                if (activeMark != null) {
                    updateActiveMark(event.getX(), event.getY());
                    // Ignore accidental taps that produced a near-zero circle
                    if (activeMark.width() > 12 || activeMark.height() > 12) {
                        marks.add(activeMark);
                        // One mark is enough -- auto-exit mark mode so the
                        // next touch scrolls/pans the PDF instead of drawing
                        // another circle wherever the finger happens to land.
                        markModeEnabled = false;
                        if (onMarkAddedListener != null) {
                            onMarkAddedListener.onMarkAdded();
                        }
                    }
                    activeMark = null;
                    invalidate();
                }
                return true;

            default:
                return false;
        }
    }

    private void updateActiveMark(float x, float y) {
        activeMark.left = Math.min(startX, x);
        activeMark.top = Math.min(startY, y);
        activeMark.right = Math.max(startX, x);
        activeMark.bottom = Math.max(startY, y);
    }
}
