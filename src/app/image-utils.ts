/**
 * Compresses an image (File or base64 string) to maximum dimensions and JPEG quality.
 */
export async function compressImage(
  input: File | string,
  maxWidth = 800,
  maxHeight = 800,
  quality = 0.82
): Promise<string> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || typeof document === 'undefined' || !document.createElement) {
      resolve(typeof input === 'string' ? input : '');
      return;
    }

    const img = new Image();
    let hasEnded = false;

    // Safety timeout for SSR / headless test runners where Image loading doesn't fire
    const timer = setTimeout(() => {
      if (!hasEnded) {
        hasEnded = true;
        resolve(typeof input === 'string' ? input : '');
      }
    }, 300);

    img.onload = () => {
      if (hasEnded) return;
      hasEnded = true;
      clearTimeout(timer);
      let width = img.width;
      let height = img.height;

      if (width > maxWidth || height > maxHeight) {
        if (width > height) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        } else {
          width = Math.round((width * maxHeight) / height);
          height = maxHeight;
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(typeof input === 'string' ? input : '');
        return;
      }

      ctx.drawImage(img, 0, 0, width, height);
      const dataUrl = canvas.toDataURL('image/jpeg', quality);
      resolve(dataUrl);
    };

    img.onerror = (err) => {
      if (hasEnded) return;
      hasEnded = true;
      clearTimeout(timer);
      if (typeof input === 'string') {
        resolve(input);
      } else {
        reject(err);
      }
    };

    if (typeof input === 'string') {
      img.src = input;
    } else {
      const reader = new FileReader();
      reader.onload = (e) => {
        img.src = e.target?.result as string;
      };
      reader.onerror = (err) => reject(err);
      reader.readAsDataURL(input);
    }
  });
}
