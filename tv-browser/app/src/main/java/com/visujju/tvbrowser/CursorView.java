package com.visujju.tvbrowser;

import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.Path;
import android.view.View;

/** A non-intercepting overlay: the pointer is moved and clicked with the TV D-pad. */
final class CursorView extends View {
    private final RemotePointer pointer;
    private final Paint halo = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint fill = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint outline = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Path shape = new Path();
    private final float density;

    CursorView(Context context) {
        super(context);
        density = getResources().getDisplayMetrics().density;
        pointer = new RemotePointer(density);
        setFocusable(false);
        setClickable(false);
        setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_NO);
        halo.setColor(Color.argb(90, 14, 30, 42));
        fill.setColor(Color.WHITE);
        fill.setStyle(Paint.Style.FILL);
        outline.setColor(Color.rgb(14, 45, 50));
        outline.setStyle(Paint.Style.STROKE);
        outline.setStrokeJoin(Paint.Join.ROUND);
        outline.setStrokeWidth(1.6f * density);
    }

    @Override
    protected void onSizeChanged(int w, int h, int oldw, int oldh) {
        super.onSizeChanged(w, h, oldw, oldh);
        pointer.resize(w, h);
    }

    RemotePointer.Action move(RemotePointer.Direction direction, int repeats,
                              boolean canUp, boolean canDown, boolean canLeft, boolean canRight) {
        RemotePointer.Action action = pointer.move(direction, repeats, canUp, canDown, canLeft, canRight);
        invalidate();
        return action;
    }

    float pointerX() { return pointer.x(); }
    float pointerY() { return pointer.y(); }

    @Override
    protected void onDraw(Canvas canvas) {
        super.onDraw(canvas);
        float x = pointer.x();
        float y = pointer.y();
        canvas.drawCircle(x + 3 * density, y + 3 * density, 13 * density, halo);
        shape.reset();
        shape.moveTo(x, y);
        shape.lineTo(x + 2 * density, y + 22 * density);
        shape.lineTo(x + 7 * density, y + 16 * density);
        shape.lineTo(x + 11 * density, y + 25 * density);
        shape.lineTo(x + 15 * density, y + 23 * density);
        shape.lineTo(x + 11 * density, y + 14 * density);
        shape.lineTo(x + 19 * density, y + 14 * density);
        shape.close();
        canvas.drawPath(shape, fill);
        canvas.drawPath(shape, outline);
    }
}
