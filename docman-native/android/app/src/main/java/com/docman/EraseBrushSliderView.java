// FILE LOCATION:
// android/app/src/main/java/com/docman/EraseBrushSliderView.java

package com.docman;

import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.RectF;
import android.view.MotionEvent;
import android.view.View;

// The Erase tool's brush-size slider: orange fill, white thumb. Reports every
// change while dragging (dragging=true, for the live size ring) and once more
// on release (dragging=false, so the size can be remembered).
public class EraseBrushSliderView extends View {

    public interface OnValueChangeListener {
        void onValueChanged(float value, boolean dragging);
    }

    private final float density;
    private final Paint track = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint fill = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint thumb = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint halo = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final RectF bar = new RectF();
    private float value = 0.35f;
    private boolean dragging = false;
    private OnValueChangeListener listener;

    public EraseBrushSliderView(Context context) {
        super(context);
        density = context.getResources().getDisplayMetrics().density;
        track.setColor(Color.parseColor("#34365C"));
        fill.setColor(Color.parseColor("#FF9442"));
        thumb.setColor(Color.WHITE);
        halo.setColor(Color.argb(90, 255, 148, 66));
        setContentDescription("Brush size");
    }

    public void setOnValueChangeListener(OnValueChangeListener l) {
        listener = l;
    }

    public void setValue(float v) {
        value = Math.max(0f, Math.min(1f, v));
        invalidate();
    }

    public float getValue() {
        return value;
    }

    private float left() {
        return 16f * density;
    }

    private float right() {
        return getWidth() - 16f * density;
    }

    @Override
    protected void onDraw(Canvas canvas) {
        float l = left(), r = right(), cy = getHeight() / 2f, half = 2f * density;
        bar.set(l, cy - half, r, cy + half);
        canvas.drawRoundRect(bar, half, half, track);
        float x = l + value * (r - l);
        bar.set(l, cy - half, x, cy + half);
        canvas.drawRoundRect(bar, half, half, fill);
        canvas.drawCircle(x, cy, (dragging ? 16f : 13f) * density, halo);
        canvas.drawCircle(x, cy, 10f * density, thumb);
    }

    @Override
    public boolean onTouchEvent(MotionEvent e) {
        switch (e.getActionMasked()) {
            case MotionEvent.ACTION_DOWN:
                if (getParent() != null) getParent().requestDisallowInterceptTouchEvent(true);
                dragging = true;
                moveTo(e.getX());
                return true;
            case MotionEvent.ACTION_MOVE:
                moveTo(e.getX());
                return true;
            case MotionEvent.ACTION_UP:
                moveTo(e.getX());
                performClick();
                release();
                return true;
            case MotionEvent.ACTION_CANCEL:
                release();
                return true;
            default:
                return true;
        }
    }

    @Override
    public boolean performClick() {
        return super.performClick();
    }

    private void moveTo(float x) {
        float span = right() - left();
        if (span <= 0) return;
        value = Math.max(0f, Math.min(1f, (x - left()) / span));
        invalidate();
        if (listener != null) listener.onValueChanged(value, true);
    }

    private void release() {
        dragging = false;
        invalidate();
        if (listener != null) listener.onValueChanged(value, false);
    }
}
