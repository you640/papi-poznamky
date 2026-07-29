import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { compressImage } from './image-utils';

describe('PWA Capabilities & Infrastructure Tests', () => {
  it('should have a valid manifest.webmanifest file with standalone mode and icons', () => {
    const manifestPath = path.join(process.cwd(), 'public', 'manifest.webmanifest');
    expect(fs.existsSync(manifestPath)).toBe(true);

    const content = fs.readFileSync(manifestPath, 'utf-8');
    const manifest = JSON.parse(content);

    expect(manifest.name).toBe('Papi CRM');
    expect(manifest.short_name).toBe('Papi CRM');
    expect(manifest.start_url).toBe('/');
    expect(manifest.display).toBe('standalone');
    expect(manifest.background_color).toBe('#0a0a0b');
    expect(manifest.theme_color).toBe('#0a0a0b');
    expect(manifest.orientation).toBe('portrait');
    expect(Array.isArray(manifest.icons)).toBe(true);
    expect(manifest.icons.length).toBeGreaterThanOrEqual(3);

    const has192 = manifest.icons.some((i: { sizes: string }) => i.sizes.includes('192x192'));
    const has512 = manifest.icons.some((i: { sizes: string }) => i.sizes.includes('512x512'));
    const hasMaskable = manifest.icons.some((i: { purpose: string }) => i.purpose === 'maskable');

    expect(has192).toBe(true);
    expect(has512).toBe(true);
    expect(hasMaskable).toBe(true);
  });

  it('should have icon assets present in the public directory', () => {
    const icon192 = path.join(process.cwd(), 'public', 'icon-192.svg');
    const icon512 = path.join(process.cwd(), 'public', 'icon-512.svg');
    const iconMaskable = path.join(process.cwd(), 'public', 'icon-maskable.svg');

    expect(fs.existsSync(icon192)).toBe(true);
    expect(fs.existsSync(icon512)).toBe(true);
    expect(fs.existsSync(iconMaskable)).toBe(true);
  });

  it('should have a functional Service Worker (sw.js) with precaching and stale-while-revalidate strategy', () => {
    const swPath = path.join(process.cwd(), 'public', 'sw.js');
    expect(fs.existsSync(swPath)).toBe(true);

    const content = fs.readFileSync(swPath, 'utf-8');
    expect(content).toContain('papi-crm-v1');
    expect(content).toContain('PRECACHE_ASSETS');
    expect(content).toContain('install');
    expect(content).toContain('activate');
    expect(content).toContain('fetch');
    expect(content).toContain('caches.match');
  });

  it('should verify HTML metadata for iOS Safari PWA support', () => {
    const htmlPath = path.join(process.cwd(), 'src', 'index.html');
    expect(fs.existsSync(htmlPath)).toBe(true);

    const content = fs.readFileSync(htmlPath, 'utf-8');
    expect(content).toContain('apple-mobile-web-app-capable');
    expect(content).toContain('apple-mobile-web-app-status-bar-style');
    expect(content).toContain('apple-touch-icon');
    expect(content).toContain('manifest.webmanifest');
  });

  it('should fallback gracefully in compressImage when window or DOM context is mocked', async () => {
    const result = await compressImage('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==');
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });
});
