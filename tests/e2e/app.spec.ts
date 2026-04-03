import { expect, test } from 'playwright/test';

test('opens guide and log dialogs, then resigns from a live match', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByText('軍儀')).toBeVisible();
  await expect(page.getByTestId('match-phase')).toHaveText('対局中');

  await page.getByTestId('open-rule-guide').click();
  const ruleDialog = page.getByRole('dialog', { name: '軍儀ルール' });
  await expect(ruleDialog).toBeVisible();
  await ruleDialog.getByRole('button', { name: '閉じる' }).click();

  await page.getByTestId('open-match-log').click();
  const logDialog = page.getByRole('dialog', { name: '対局ログ' });
  await expect(logDialog).toBeVisible();
  await logDialog.getByRole('button', { name: '閉じる' }).click();

  await page.getByTestId('resign-match').click();
  await page.getByRole('button', { name: '投了する' }).click();

  await expect(page.getByText('対局結果')).toBeVisible();
});

test('runs advanced auto-match, reaches battle, and restores from saved state', async ({ page }) => {
  await page.goto('/');

  await page.getByTestId('pending-ruleset').selectOption('advanced');
  await page.getByTestId('start-auto-match').click();
  await page.getByRole('button', { name: '自動対局を開始' }).click();

  await expect(page.getByTestId('match-phase')).toHaveText('配置中');
  await expect
    .poll(async () => Number((await page.getByTestId('move-count').textContent()) ?? '0'))
    .toBeGreaterThan(0);

  await page.getByTestId('toggle-auto-match-paused').click();
  await expect(page.getByTestId('toggle-auto-match-paused')).toHaveText('再開');
  await page.getByTestId('toggle-auto-match-paused').click();

  await expect(page.getByTestId('match-phase')).toHaveText('対局中', { timeout: 90_000 });

  const beforeReload = Number((await page.getByTestId('move-count').textContent()) ?? '0');
  await page.reload();

  await expect
    .poll(async () => Number((await page.getByTestId('move-count').textContent()) ?? '0'))
    .toBeGreaterThanOrEqual(beforeReload);
});

test('supports hint display, save-slot restore, and replay controls on the main screen', async ({ page }) => {
  await page.goto('/');

  await page.getByTestId('toggle-hint').click();
  await expect(page.getByTestId('hint-text')).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId('replay-controls')).toHaveCount(0);

  await page.getByTestId('open-save-manager').click();
  let saveDialog = page.getByRole('dialog', { name: '保存管理' });
  await expect(saveDialog).toBeVisible();
  await saveDialog.locator('.save-slot-card').first().getByRole('button', { name: '保存' }).click();
  await saveDialog.getByRole('button', { name: '閉じる' }).click();

  await page.getByTestId('pending-ruleset').selectOption('advanced');
  await page.getByTestId('start-auto-match').click();
  await page.getByRole('button', { name: '自動対局を開始' }).click();
  await expect
    .poll(async () => Number((await page.getByTestId('move-count').textContent()) ?? '0'))
    .toBeGreaterThan(0);

  await page.getByTestId('open-match-log').click();
  const logDialog = page.getByRole('dialog', { name: '対局ログ' });
  await logDialog.getByRole('button', { name: /先手|後手/ }).first().click();

  await expect(page.getByTestId('replay-controls')).toBeVisible();
  await page.getByTestId('replay-jump-latest').click();
  await expect(page.getByTestId('replay-controls')).toHaveCount(0);

  await page.getByTestId('open-save-manager').click();
  saveDialog = page.getByRole('dialog', { name: '保存管理' });
  await saveDialog.locator('.save-slot-card').first().getByRole('button', { name: '読み込む' }).click();

  await expect(page.getByTestId('match-phase')).toHaveText('対局中');
  await expect(page.getByTestId('move-count')).toHaveText('0');
});
