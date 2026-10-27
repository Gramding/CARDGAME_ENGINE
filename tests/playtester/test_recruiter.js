// Imperial Recruiter finds creatures by printed power: Veyran (2/2) yes, Sakashima, Birgi and Ashling (3+) no.
const { table, check } = require('./lib');
(async () => {
  const T = await table();
  const { go, state } = T;
  await T.setup([], ['Imperial Recruiter'], 'krark');
  await go(() => recruiterFind());
  const names = await state(() => [...document.querySelectorAll('#sheetBody .pick')].map(b => b.textContent));
  check('Veyran, Voice of Duality is in the list', names.some(n => n.startsWith('Veyran')), names.join(' | '));
  check('Harmonic Prodigy and Tavern Scoundrel are in it too', ['Harmonic Prodigy', 'Tavern Scoundrel'].every(x => names.some(n => n.startsWith(x))));
  check('Birgi and Ashling (power 3 and 4) are not', !names.some(n => /^Birgi|^Ashling/.test(n)));
  await T.press('Take it');
  check('The chosen creature went to hand', await state(() => S.hand.length === 1 && C[S.hand[0]].k === 'creature'));
  await T.setup([], ['Imperial Recruiter'], 'kefka');
  await go(() => recruiterFind());
  const k = await state(() => [...document.querySelectorAll('#sheetBody .pick')].map(b => b.textContent));
  check('In the Kefka list: Thassa\'s Oracle and Displacer Kitten yes, Gilded Drake (3/3) and Kefka no', k.some(n => n.startsWith("Thassa")) && k.some(n => n.startsWith('Displacer')) && !k.some(n => /^Gilded|^Kefka/.test(n)), k.join(' | '));
  await T.done();
})();
