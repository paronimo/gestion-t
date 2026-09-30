export default async function run(page, ui) {
  const r = {};
  const errores = [];
  page.on('response', async (x) => { if (x.status() >= 400) errores.push(x.status() + ' ' + x.url()); });

  await page.goto('http://127.0.0.1:5200/', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.month-toolbar');
  await page.waitForTimeout(2500);

  // Registrar una casa YA en la base que sirva para grupo 9 y congregacional
  const id = await page.evaluate(async () => {
    const r1 = await fetch('/api/houses', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'CASA PRUEBA', group: '9', congregationalWeekend: true })
    });
    return (await r1.json()).id;
  });
  const y = 2026, m = 9;
  await page.evaluate(async ([id, y, m]) => {
    await fetch(`/api/months/${y}/${m}/houses/${id}/availability`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ available: true })
    });
  }, [id, y, m]);

  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.month-toolbar');
  await page.waitForTimeout(2500);

  // Salida manual tipo Grupo 9
  await page.getByRole('button', { name: '+ Agregar salida manual' }).click();
  await page.waitForTimeout(2000);
  const f = page.locator('.outing-form');
  await f.locator('.field', { hasText: 'Tipo' }).locator('select').selectOption('Grupo 9');
  await page.waitForTimeout(2500);
  r.trasTipoGrupo9 = await f.locator('.field-place option').allTextContents();

  // Sábado para congregacional
  await f.locator('input[type=date]').fill('2026-09-05');
  await f.locator('.field', { hasText: 'Tipo' }).locator('select').selectOption('Congregacional');
  await page.waitForTimeout(2500);
  r.trasTipoCongregacionalSabado = await f.locator('.field-place option').allTextContents();

  // Conductores: registrar turno y ver si aparece
  const drv = await page.evaluate(async () => {
    const r1 = await fetch('/api/drivers', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ firstName: 'Turno', lastName: 'QA', category: 'Publicador', group: '9' })
    });
    return (await r1.json()).id;
  });
  await page.evaluate(async ([drv, y, m]) => {
    await fetch(`/api/months/${y}/${m}/drivers/${drv}/availability`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ slots: { '6:morning': true } })
    });
  }, [drv, y, m]);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.month-toolbar');
  await page.waitForTimeout(2500);
  await page.getByRole('button', { name: '+ Agregar salida manual' }).click();
  await page.waitForTimeout(2000);
  await f.locator('input[type=date]').fill('2026-09-05');
  await f.locator('.field', { hasText: 'Tipo' }).locator('select').selectOption('Grupo 9');
  await page.waitForTimeout(2500);
  r.conductoresGrupo9 = await f.locator('.field', { hasText: 'Conductor' }).locator('option').allTextContents();
  r.casasGrupo9 = await f.locator('.field-place option').allTextContents();
  r.errores = errores;
  return r;
}
