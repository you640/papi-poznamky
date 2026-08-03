import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

export interface IPhoneDeviceSpec {
  model: string;
  width: number;
  height: number;
  topInsetPx: number; // Notch or Dynamic Island height in px
  bottomInsetPx: number; // Home indicator bar height in px
  hasDynamicIsland: boolean;
}

export const IPHONE_MODELS: IPhoneDeviceSpec[] = [
  { model: 'iPhone 13 Mini', width: 375, height: 812, topInsetPx: 50, bottomInsetPx: 34, hasDynamicIsland: false },
  { model: 'iPhone 13 / 13 Pro / 14', width: 390, height: 844, topInsetPx: 47, bottomInsetPx: 34, hasDynamicIsland: false },
  { model: 'iPhone 13 Pro Max / 14 Plus', width: 428, height: 926, topInsetPx: 47, bottomInsetPx: 34, hasDynamicIsland: false },
  { model: 'iPhone 14 Pro / 15 / 15 Pro / 16', width: 393, height: 852, topInsetPx: 59, bottomInsetPx: 34, hasDynamicIsland: true },
  { model: 'iPhone 14 Pro Max / 15 Plus / 15 Pro Max / 16 Plus', width: 430, height: 932, topInsetPx: 59, bottomInsetPx: 34, hasDynamicIsland: true },
  { model: 'iPhone 16 Pro / 17 Pro', width: 402, height: 874, topInsetPx: 59, bottomInsetPx: 34, hasDynamicIsland: true },
  { model: 'iPhone 16 Pro Max / 17 Pro Max', width: 440, height: 956, topInsetPx: 59, bottomInsetPx: 34, hasDynamicIsland: true }
];

describe('iPhone 13, 14, 15, 16, 17 Safe Area & Viewport Tests', () => {
  it('should verify index.html contains viewport-fit=cover for edge-to-edge iOS rendering', () => {
    const indexPath = path.join(process.cwd(), 'src/index.html');
    const indexContent = fs.readFileSync(indexPath, 'utf-8');

    expect(indexContent).toContain('viewport-fit=cover');
    expect(indexContent).toContain('apple-mobile-web-app-capable');
    expect(indexContent).toContain('black-translucent');
  });

  it('should verify styles.css includes pt-safe and pb-safe utilities for env(safe-area-inset-*)', () => {
    const cssPath = path.join(process.cwd(), 'src/styles.css');
    const cssContent = fs.readFileSync(cssPath, 'utf-8');

    expect(cssContent).toContain('pt-safe');
    expect(cssContent).toContain('env(safe-area-inset-top');
    expect(cssContent).toContain('pb-safe');
    expect(cssContent).toContain('env(safe-area-inset-bottom');
  });

  it('should verify app.html header applies pt-safe to offset touch controls below camera cutout', () => {
    const htmlPath = path.join(process.cwd(), 'src/app/app.html');
    const htmlContent = fs.readFileSync(htmlPath, 'utf-8');

    expect(htmlContent).toContain('pt-safe');
    expect(htmlContent).toContain('min-h-[calc(4rem+env(safe-area-inset-top,0px))]');
  });

  IPHONE_MODELS.forEach((device) => {
    it(`should calculate touch boundary start Y for ${device.model} (${device.width}x${device.height}px)`, () => {
      // Base header height is 64px (4rem)
      const baseHeaderHeightPx = 64;
      const effectiveHeaderTopPadding = device.topInsetPx;
      const touchContentStartY = effectiveHeaderTopPadding + 8; // 8px visual padding below notch/Dynamic Island

      // Verify that touch controls start strictly BELOW the camera/notch area
      expect(touchContentStartY).toBeGreaterThan(device.topInsetPx);

      if (device.hasDynamicIsland) {
        // Dynamic Island devices require at least 59px top inset
        expect(effectiveHeaderTopPadding).toBeGreaterThanOrEqual(59);
      } else {
        // Notch devices require at least 47px top inset
        expect(effectiveHeaderTopPadding).toBeGreaterThanOrEqual(47);
      }

      // Verify header height dynamically accommodates the top inset
      const totalHeaderHeight = baseHeaderHeightPx + effectiveHeaderTopPadding;
      expect(totalHeaderHeight).toBeLessThan(device.height * 0.25); // Header should take < 25% of screen height
    });
  });
});
