import cvModule from '@techstark/opencv-js';

// The bundled OpenCV.js build initializes its WASM runtime asynchronously.
// `loadOpenCV()` resolves with the ready-to-use `cv` object and caches the
// promise so the runtime is only initialized once.
let readyPromise = null;

export function loadOpenCV() {
  if (!readyPromise) {
    readyPromise = new Promise((resolve, reject) => {
      if (cvModule instanceof Promise) {
        cvModule.then(resolve).catch(reject);
      } else if (cvModule && cvModule.Mat) {
        resolve(cvModule);
      } else {
        cvModule.onRuntimeInitialized = () => resolve(cvModule);
      }
    });
  }
  return readyPromise;
}
