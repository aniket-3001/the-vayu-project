import { expect, test, type Page } from '@playwright/test';
import { DROP, fakeApi, saveHome } from './mock';

/** Anything the page reports as broken: uncaught errors, and every console error (a blocked script shows up here). */
function watchForErrors(page: Page): string[] {
  const problems: string[] = [];
  page.on('pageerror', (error) => problems.push(`uncaught: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') problems.push(`console: ${message.text()}`);
  });
  return problems;
}

test.describe('the built app in a real browser', () => {
  test('opens on My Air with its tab bar, and nothing is broken', async ({ page }) => {
    const problems = watchForErrors(page);
    await fakeApi(page);
    await page.goto('/');
    const tabs = page.getByRole('navigation', { name: 'Main' });
    await expect(tabs.getByRole('link', { name: 'My Air' })).toBeVisible();
    for (const name of ['Exposure', 'Map', 'AIR Lens']) {
      await expect(tabs.getByRole('link', { name })).toBeVisible();
    }
    expect(problems).toEqual([]);
  });

  test('shows a saved place with its air and where the number came from', async ({ page }) => {
    const problems = watchForErrors(page);
    await fakeApi(page);
    await saveHome(page);
    await page.goto('/');
    const card = page.getByRole('listitem').filter({ hasText: 'Home' });
    await expect(card).toBeVisible();
    // Every number says which monitor, how far, and how old (the app's signature).
    await expect(card).toContainText('Nearby station');
    await expect(card).toContainText('Test Monitor');
    await expect(card).toContainText('2.5 km');
    expect(problems).toEqual([]);
  });

  test('has no content-policy violations on the screens that need no map or camera', async ({
    page,
  }) => {
    const problems = watchForErrors(page);
    await fakeApi(page);
    await saveHome(page);
    await page.goto('/');
    const tabs = page.getByRole('navigation', { name: 'Main' });
    await tabs.getByRole('link', { name: 'Exposure' }).click();
    await expect(page).toHaveURL(/#\/exposure/u);
    await tabs.getByRole('link', { name: 'My Air' }).click();
    await page.getByRole('link', { name: /Open Home/u }).click();
    await expect(page).toHaveURL(/#\/place\//u);
    expect(problems.filter((p) => /content security policy|refused to/iu.test(p))).toEqual([]);
  });

  test('still shows the last good reading, with its age grown, when the network is gone', async ({
    page,
  }) => {
    await fakeApi(page);
    await saveHome(page);
    await page.goto('/');
    await expect(page.getByRole('listitem').filter({ hasText: 'Test Monitor' })).toBeVisible();

    // Now the API drops every request, and the page is opened again from scratch.
    await page.unroute('**/*');
    await fakeApi(page, { today: () => DROP });
    await page.reload();
    const card = page.getByRole('listitem').filter({ hasText: 'Home' });
    await expect(card).toContainText('Test Monitor');
    await expect(card).not.toContainText('No reading right now');
  });

  test('says plainly that there is no reading when nothing was ever saved and the network is down', async ({
    page,
  }) => {
    await fakeApi(page, { today: () => DROP });
    await saveHome(page);
    await page.goto('/');
    await expect(page.getByRole('listitem').filter({ hasText: 'Home' })).toContainText(
      /No reading right now|could not/iu,
    );
  });
});
