
import { chromium } from 'playwright';
import * as fs from 'fs';

async function main() {
  // Make sure screenshots dir exists
  const screenshotsDir = 'control-tower-shift/screenshots';
  if (!fs.existsSync(screenshotsDir)) {
    fs.mkdirSync(screenshotsDir, { recursive: true });
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ 
    viewport: { width: 430, height: 900 },
    deviceScaleFactor: 2 
  });
  const page = await context.newPage();
  
  // Go to the game
  await page.goto('http://localhost:5173/#control-tower', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  
  // Take screenshot of start screen (paused/game over state with New Shift button)
  await page.screenshot({ path: `${screenshotsDir}/m2-start-screen.png`, fullPage: true });
  
  // Click New Shift to start the game
  const newShiftBtn = await page.locator('button', { hasText: /New shift/i });
  if (await newShiftBtn.isVisible()) {
    await newShiftBtn.click();
    await page.waitForTimeout(3000);
    // Take screenshot of gameplay
    await page.screenshot({ path: `${screenshotsDir}/m4-gameplay.png`, fullPage: true });
    
    // Simulate gameplay - click the canvas to move and use Enter key
    const canvas = await page.$('canvas');
    if (canvas) {
      // Click on canvas
      await canvas.click({ position: { x: 200, y: 200 } });
      await page.waitForTimeout(2000);
      await page.screenshot({ path: `${screenshotsDir}/m6-gameplay-active.png`, fullPage: true });
      
      // Press Enter to use ability
      await page.keyboard.press('Enter');
      await page.waitForTimeout(1000);
      await page.screenshot({ path: `${screenshotsDir}/m6-ability-used.png`, fullPage: true });
    }
  }
  
  // Test mobile view
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: `${screenshotsDir}/m4-mobile-controls.png`, fullPage: true });
  
  await browser.close();
  console.log('All screenshots taken successfully');
}

main().catch(e => {
  console.error('Error:', e.message);
  process.exit(1);
});
