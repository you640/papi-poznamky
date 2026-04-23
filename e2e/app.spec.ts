import { test, expect } from '@playwright/test';

test.describe('Papi CRM E2E Tests', () => {
  test.beforeEach(async ({ page }) => {
    // The app runs on port 3000 in this environment
    await page.goto('http://localhost:3000');
    // Wait for the app to hydrate and seed data
    await page.waitForSelector('text=Papi CRM');
  });

  test('should display the header and search input', async ({ page }) => {
    const header = page.locator('header');
    await expect(header).toBeVisible();
    await expect(header).toContainText('Papi CRM');
    
    const searchInput = page.locator('input[placeholder="Hľadať zákazníka..."]');
    await expect(searchInput).toBeVisible();
  });

  test('should filter customers based on search query', async ({ page }) => {
    const searchInput = page.locator('input[placeholder="Hľadať zákazníka..."]');
    
    // Type "Jozef"
    await searchInput.fill('Jozef');
    
    // Check if only one item is visible (or at least the one we searched for)
    const results = page.locator('[#customerItem]');
    // Wait for the animation or filtering
    await page.waitForTimeout(500); 
    
    const text = await page.textContent('body');
    expect(text).toContain('Jozef Mrkva');
    expect(text).not.toContain('Adam Jablko');
  });

  test('should show customer detail when clicked', async ({ page }) => {
    // Find Jozef Mrkva and click
    const jozef = page.locator('text=Jozef Mrkva');
    await jozef.click();

    // Detail panel should appear
    const detailHeader = page.locator('text=Profil Klienta');
    await expect(detailHeader).toBeVisible();
    
    const detailName = page.locator('h1:has-text("Jozef Mrkva")');
    await expect(detailName).toBeVisible();
    
    const detailPhone = page.locator('text=0901 123 456');
    await expect(detailPhone).toBeVisible();
  });

  test('should clear search when clicking cancel button', async ({ page }) => {
    const searchInput = page.locator('input[placeholder="Hľadať zákazníka..."]');
    await searchInput.fill('Michal');
    
    const clearButton = page.locator('button:has-text("cancel")');
    await expect(clearButton).toBeVisible();
    
    await clearButton.click();
    await expect(searchInput).toHaveValue('');
    
    // All customers should be back
    await page.waitForTimeout(500);
    const text = await page.textContent('body');
    expect(text).toContain('Adam Jablko');
  });

  test('should show correct visits in history', async ({ page }) => {
    await page.locator('text=Jozef Mrkva').click();
    
    const historyHeader = page.locator('text=História návštev');
    await expect(historyHeader).toBeVisible();
    
    // Check if at least one visit is present (seeded data)
    const visitItems = page.locator('mat-icon:has-text("content_cut")');
    expect(await visitItems.count()).toBeGreaterThan(0);
  });
});
