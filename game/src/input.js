// Keyboard and mouse state for SOLMAR. Keys are tracked by code (KeyW, Space
// and friends) so layouts do not matter. The mouse orbits the camera while
// dragged; edge presses (wasPressed) let actions like E and F fire once.

export class Input {
  constructor() {
    this.keys = new Set();
    this.pressed = new Set();
    this.dragging = false;
    this.lastX = 0;
    this.lastY = 0;
    this.deltaX = 0;
    this.deltaY = 0;
    this.anyKey = false;
  }

  attach(canvas) {
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
      if (!this.keys.has(e.code)) this.pressed.add(e.code);
      this.keys.add(e.code);
      this.anyKey = true;
    });
    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
    });
    window.addEventListener('blur', () => {
      this.keys.clear();
    });
    canvas.addEventListener('pointerdown', (e) => {
      this.dragging = true;
      this.lastX = e.clientX;
      this.lastY = e.clientY;
      canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!this.dragging) return;
      this.deltaX += e.clientX - this.lastX;
      this.deltaY += e.clientY - this.lastY;
      this.lastX = e.clientX;
      this.lastY = e.clientY;
    });
    const stop = () => { this.dragging = false; };
    canvas.addEventListener('pointerup', stop);
    canvas.addEventListener('pointercancel', stop);
  }

  isDown(code) {
    return this.keys.has(code);
  }

  // True only on the frame the key went down.
  wasPressed(code) {
    return this.pressed.has(code);
  }

  // Call once per frame, after the game has read the state.
  endFrame() {
    this.pressed.clear();
    this.deltaX = 0;
    this.deltaY = 0;
  }
}
