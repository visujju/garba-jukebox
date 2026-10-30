package com.visujju.tvbrowser;

/** Pure movement logic for the on-screen TV remote pointer. Coordinates are view-local pixels. */
final class RemotePointer {
    enum Direction { UP, DOWN, LEFT, RIGHT }
    enum Action { MOVED, SCROLL_UP, SCROLL_DOWN, SCROLL_LEFT, SCROLL_RIGHT, OPEN_TOOLBAR }

    private final float density;
    private float width;
    private float height;
    private float x;
    private float y;
    private boolean initialized;

    RemotePointer(float density) {
        this.density = density > 0 ? density : 1f;
    }

    void resize(int newWidth, int newHeight) {
        width = Math.max(0, newWidth);
        height = Math.max(0, newHeight);
        if (width == 0 || height == 0) return;
        if (!initialized) {
            x = width / 2f;
            y = height / 2f;
            initialized = true;
        } else {
            x = clamp(x, minX(), maxX());
            y = clamp(y, minY(), maxY());
        }
    }

    Action move(Direction direction, int repeats, boolean canUp, boolean canDown,
                boolean canLeft, boolean canRight) {
        if (!initialized || direction == null) return Action.MOVED;
        float step = (16f + Math.min(12, Math.max(0, repeats)) * 2f) * density;
        switch (direction) {
            case UP:
                if (y <= minY()) return canUp ? Action.SCROLL_UP : Action.OPEN_TOOLBAR;
                y = clamp(y - step, minY(), maxY());
                break;
            case DOWN:
                if (y >= maxY() && canDown) return Action.SCROLL_DOWN;
                y = clamp(y + step, minY(), maxY());
                break;
            case LEFT:
                if (x <= minX() && canLeft) return Action.SCROLL_LEFT;
                x = clamp(x - step, minX(), maxX());
                break;
            case RIGHT:
                if (x >= maxX() && canRight) return Action.SCROLL_RIGHT;
                x = clamp(x + step, minX(), maxX());
                break;
        }
        return Action.MOVED;
    }

    float x() { return x; }
    float y() { return y; }

    private float minX() { return Math.min(12f * density, width / 2f); }
    private float maxX() { return Math.max(minX(), width - 12f * density); }
    private float minY() { return Math.min(12f * density, height / 2f); }
    private float maxY() { return Math.max(minY(), height - 12f * density); }
    private static float clamp(float value, float min, float max) {
        return Math.max(min, Math.min(max, value));
    }
}
