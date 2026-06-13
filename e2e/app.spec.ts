import { test, expect } from '@playwright/test';

test.describe('Papi Hair Design CRM E2E Tests', () => {
  test.beforeEach(async ({ page }) => {
    // The app runs on port 3000 in this environment
    await page.goto('http://localhost:3000');
    // Wait for the app to hydrate and load the brand logo and seeded client
    await page.waitForSelector('img[alt="Papi Hair Design"]');
    await page.waitForSelector('text=Jozef Mrkva');
  });

  test('should display the header with logo image and search inputs', async ({ page }) => {
    const header = page.locator('header');
    await expect(header).toBeVisible();
    await expect(header.locator('img[alt="Papi Hair Design"]')).toBeVisible();
    
    const searchInput = page.locator('input').first();
    await expect(searchInput).toBeVisible();
  });

  test('should filter customers based on search query and show empty state if none matched', async ({ page }) => {
    const searchInput = page.locator('input').first();
    
    // Type "Neznamy" to trigger empty search state
    await searchInput.fill('Neznamy');
    await page.waitForTimeout(500); 
    
    let text = await page.textContent('body');
    expect(text).toContain('Nenašli sa žiadne zhody');
    expect(text).not.toContain('Jozef Mrkva');

    // Type "Jozef"
    await searchInput.fill('Jozef');
    await page.waitForTimeout(500);

    text = await page.textContent('body');
    expect(text).toContain('Jozef Mrkva');
  });

  test('should show customer detail when clicked', async ({ page }) => {
    // Find Jozef Mrkva and click
    const jozef = page.locator('text=Jozef Mrkva');
    await jozef.click();

    // Detail panel should appear
    const detailHeader = page.locator('text=Interná klientská karta');
    await expect(detailHeader).toBeVisible();
    
    const detailName = page.locator('h1:has-text("Jozef")');
    await expect(detailName).toBeVisible();
    
    const detailPhone = page.locator('text=0911 222 333');
    await expect(detailPhone).toBeVisible();
  });

  test('should clear search when clicking cancel button', async ({ page }) => {
    const searchInput = page.locator('input').first();
    await searchInput.fill('Jozef');
    
    const clearButton = page.locator('button:has-text("cancel")');
    await expect(clearButton).toBeVisible();
    
    await clearButton.click();
    await expect(searchInput).toHaveValue('');
  });

  test('should show correct visits in history', async ({ page }) => {
    await page.locator('text=Jozef Mrkva').click();
    
    // Scroll down or look for history header / visits details
    // Check if at least one visit is present (seeded data: service "Strih + Farbenie + Brada")
    const visitItem = page.locator('text=Strih + Farbenie + Brada');
    await expect(visitItem).toBeVisible();
  });
});
