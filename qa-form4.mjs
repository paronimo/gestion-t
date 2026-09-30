export default async function run(page, ui) {
  const r = {};
  await page.goto('http://127.0.0.1:5200/', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.month-toolbar');
  await page.waitForTimeout(2000);
  await page.getByRole('button', { name: '+ Agregar salida manual' }).click();
  await page.waitForSelector('.outing-form');
  await page.waitForTimeout(1500);

  const style = await page.evaluate(() => {
    const out = {};
    for (const label of document.querySelectorAll('.outing-form .field')) {
      const name = label.querySelector('span').textContent;
      const ctl = label.querySelector('input, select');
      if (!ctl) continue;
      const s = getComputedStyle(ctl);
      out[name] = {
        value: ctl.value, readonly: ctl.readOnly, disabled: ctl.disabled,
        pointerEvents: s.pointerEvents, opacity: s.opacity, w: ctl.offsetWidth, h: ctl.offsetHeight
      };
    }
    return out;
  });
  r.style = style;
  const box = await page.locator('.outing-form').boundingBox();
  r.box = box;
  await page.screenshot({ path: '/tmp/form.png', clip: { x: box.x, y: Math.max(0, box.y), width: box.width, height: box.height } });
  return r;
}
