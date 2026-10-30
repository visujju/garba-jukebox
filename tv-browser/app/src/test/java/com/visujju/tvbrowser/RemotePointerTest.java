package com.visujju.tvbrowser;

import org.junit.Test;
import static org.junit.Assert.*;

public class RemotePointerTest {
    @Test public void startsInCenterAndMovesWithRemote() {
        RemotePointer pointer = new RemotePointer(1);
        pointer.resize(200, 100);
        assertEquals(100f, pointer.x(), 0.01f);
        assertEquals(50f, pointer.y(), 0.01f);
        assertEquals(RemotePointer.Action.MOVED,
                pointer.move(RemotePointer.Direction.RIGHT, 0, false, false, false, false));
        assertEquals(116f, pointer.x(), 0.01f);
        pointer.move(RemotePointer.Direction.DOWN, 0, false, false, false, false);
        assertEquals(66f, pointer.y(), 0.01f);
    }

    @Test public void holdingAnArrowAcceleratesButStaysWithinTheViewport() {
        RemotePointer pointer = new RemotePointer(1);
        pointer.resize(200, 200);
        pointer.move(RemotePointer.Direction.RIGHT, 10, false, false, false, false);
        assertEquals(136f, pointer.x(), 0.01f);
        for (int i = 0; i < 20; i++) pointer.move(RemotePointer.Direction.RIGHT, 20, false, false, false, false);
        assertEquals(188f, pointer.x(), 0.01f);
    }

    @Test public void topEdgeScrollsUpOrOpensToolbar() {
        RemotePointer pointer = new RemotePointer(1);
        pointer.resize(200, 200);
        for (int i = 0; i < 8; i++) pointer.move(RemotePointer.Direction.UP, 0, true, false, false, false);
        assertEquals(12f, pointer.y(), 0.01f);
        assertEquals(RemotePointer.Action.SCROLL_UP,
                pointer.move(RemotePointer.Direction.UP, 0, true, false, false, false));
        assertEquals(RemotePointer.Action.OPEN_TOOLBAR,
                pointer.move(RemotePointer.Direction.UP, 0, false, false, false, false));
    }

    @Test public void bottomAndSidesScrollOnlyIfThePageCanScroll() {
        RemotePointer pointer = new RemotePointer(1);
        pointer.resize(100, 100);
        for (int i = 0; i < 5; i++) pointer.move(RemotePointer.Direction.DOWN, 0, false, true, false, false);
        assertEquals(RemotePointer.Action.SCROLL_DOWN,
                pointer.move(RemotePointer.Direction.DOWN, 0, false, true, false, false));
        assertEquals(RemotePointer.Action.MOVED,
                pointer.move(RemotePointer.Direction.DOWN, 0, false, false, false, false));
        for (int i = 0; i < 5; i++) pointer.move(RemotePointer.Direction.LEFT, 0, false, false, true, false);
        assertEquals(RemotePointer.Action.SCROLL_LEFT,
                pointer.move(RemotePointer.Direction.LEFT, 0, false, false, true, false));
    }

    @Test public void handlesResizesAndVerySmallViews() {
        RemotePointer pointer = new RemotePointer(2);
        pointer.resize(400, 200);
        pointer.move(RemotePointer.Direction.RIGHT, 12, false, false, false, false);
        pointer.resize(20, 10);
        assertEquals(10f, pointer.x(), 0.01f);
        assertEquals(5f, pointer.y(), 0.01f);
        pointer.move(RemotePointer.Direction.DOWN, 0, false, false, false, false);
        assertEquals(5f, pointer.y(), 0.01f);
    }
}
