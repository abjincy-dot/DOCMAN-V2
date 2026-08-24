// FILE LOCATION:
// android/app/src/main/java/com/oarcel/docman/SignatureDrawView.java

package com.oarcel.docman;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.RectF;
import android.util.AttributeSet;
import android.view.MotionEvent;
import android.view.View;

// Plain finger-drawing pad for a hand-drawn signature. Standard
// Path-following touch handling -- draw(), clear(), and export as a Bitmap
// cropped tight to the ink (plus a little padding) with a transparent
// background, ready to hand off for placement on a PDF page.
public class SignatureDrawView extends View {

    private final Path path = new Path();
    private final Paint inkPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
    private float lastX, lastY;
    private boolean hasInk = false;
    private final RectF inkBounds = new RectF();
    // Separate from inkBounds.isEmpty(): a RectF holding a single point
    // (left==right, top==bottom) is ALSO considered "empty" by Android's own
    // definition, so using isEmpty() itself as the "has growBounds ever run"
    // check was wrong -- it kept re-triggering the "first point" branch on
    // every touch instead of ever unioning, so the box never actually grew
    // past the latest point (surfaced as "Draw a signature first" even with
    // visible ink on screen, since the final degenerate rect still read as
    // empty at export time too).
    private boolean boundsInitialized = false;

    public SignatureDrawView(Context context, AttributeSet attrs) {
        super(context, attrs);
        inkPaint.setStyle(Paint.Style.STROKE);
        inkPaint.setStrokeJoin(Paint.Join.ROUND);
        inkPaint.setStrokeCap(Paint.Cap.ROUND);
        inkPaint.setStrokeWidth(6f * context.getResources().getDisplayMetrics().density);
        inkPaint.setColor(Color.BLACK);
    }

    public boolean hasInk() {
        return hasInk;
    }

    public void clear() {
        path.reset();
        hasInk = false;
        inkBounds.setEmpty();
        boundsInitialized = false;
        invalidate();
    }

    @Override
    protected void onDraw(Canvas canvas) {
        super.onDraw(canvas);
        canvas.drawPath(path, inkPaint);
    }

    @Override
    public boolean onTouchEvent(MotionEvent event) {
        float x = event.getX(), y = event.getY();
        switch (event.getActionMasked()) {
            case MotionEvent.ACTION_DOWN:
                path.moveTo(x, y);
                lastX = x;
                lastY = y;
                growBounds(x, y);
                hasInk = true;
                invalidate();
                return true;
            case MotionEvent.ACTION_MOVE:
                path.quadTo(lastX, lastY, (x + lastX) / 2f, (y + lastY) / 2f);
                lastX = x;
                lastY = y;
                growBounds(x, y);
                invalidate();
                return true;
            case MotionEvent.ACTION_UP:
            case MotionEvent.ACTION_CANCEL:
                path.lineTo(x, y);
                growBounds(x, y);
                invalidate();
                return true;
            default:
                return false;
        }
    }

    private void growBounds(float x, float y) {
        if (!boundsInitialized) {
            inkBounds.set(x, y, x, y);
            boundsInitialized = true;
        } else {
            inkBounds.union(x, y);
        }
    }

    // Renders just the drawn strokes into a tightly-cropped, transparent-
    // background bitmap -- not a screenshot of this whole (probably larger,
    // mostly-blank) view.
    public Bitmap exportSignatureBitmap() {
        if (!hasInk || inkBounds.isEmpty()) return null;
        float pad = inkPaint.getStrokeWidth();
        float left = Math.max(0, inkBounds.left - pad);
        float top = Math.max(0, inkBounds.top - pad);
        float right = Math.min(getWidth(), inkBounds.right + pad);
        float bottom = Math.min(getHeight(), inkBounds.bottom + pad);
        int w = (int) Math.max(1, right - left);
        int h = (int) Math.max(1, bottom - top);

        Bitmap bmp = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888);
        Canvas canvas = new Canvas(bmp);
        canvas.translate(-left, -top);
        canvas.drawPath(path, inkPaint);
        return bmp;
    }
}
