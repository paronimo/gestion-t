export default async function run(page, ui) {
  const result = {};
  const api = (path, options) => page.evaluate(([p, o]) => fetch(p, {
    method: o?.method || 'GET',
    headers: { 'Content-Type': 'application/json' },
    body: o?.body ? JSON.stringify(o.body) : undefined,
  }).then((r) => r.json().catch(() => null)), [path, options]);

  await page.goto('http://127.0.0.1:5200/', { waitUntil: 'domcontentloaded' });
  await api('/api/outing-types', { method: 'POST', body: { name: 'Grupo 1' } });
  const house = await api('/api/houses', { method: 'POST', body: { name: 'Flia. Espinoza', group: '1', congregationalWeekend: true } });
  await api('/api/territory-locations', { method: 'POST', body: { name: 'C. 14C', territories: 'REVISITAS', mapsUrl: 'https://maps.google.com/?q=C+14C' } });
  const driver = await api('/api/drivers', { method: 'POST', body: { firstName: 'Ana', lastName: 'Prueba', category: 'Publicador' } });
  await api('/api/months/2026/10/drivers/' + driver.id + '/availability', { method: 'PUT', body: { slots: { '4:afternoon': true, '2:morning': true } } });
  await api('/api/months/2026/10/houses/' + house.id + '/availability', { method: 'PUT', body: { available: true } });
  await api('/api/months/2026/10/configuration', {
    method: 'PUT',
    body: {
      configuration: [
        { id: 'martes', weekday: 2, time: '09:00', type: 'Congregacional', active: true },
        { id: 'jueves', weekday: 4, time: '17:30', type: 'Grupo 1', active: true },
      ]
    },
  });
  // Salida manual con territorio y ubicación.
  const outs = await api('/api/months/2026/10/outings');
  const loc = await api('/api/territory-locations');
  await api('/api/months/2026/10/outings', {
    method: 'POST',
    body: { date: '2026-10-03', time: '10:00', type: 'Congregacional', territory: 'REVISITAS', driverId: null, driver: '', placeId: loc[0].id, placeType: 'location' },
  });

  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.month-toolbar');
  await page.locator('.month-controls select').selectOption('10');
  await page.waitForTimeout(2200);

  const link = page.getByRole('link', { name: 'Descargar PDF' });
  result.boton = await link.count();
  result.href = await link.getAttribute('href');
  result.download = await link.getAttribute('download');

  const descarga = await Promise.all([
    page.waitForEvent('download'),
    link.click(),
  ]).then(([d]) => d).catch((e) => ({ error: e.message }));
  result.nombreDescarga = descarga.suggestedFilename ? await descarga.suggestedFilename() : descarga.error;

  const response = await page.evaluate(async (url) => {
    const r = await fetch(url);
    const b = await r.blob();
    return { type: r.headers.get('content-type'), disp: r.headers.get('content-disposition'), size: b.size, head: b.slice(0, 5).text() };
  }, '/api/months/2026/10/schedule.pdf');
  result.respuesta = response;
  return result;
}
