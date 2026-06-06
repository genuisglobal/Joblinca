import en from '../lib/i18n/translations/en';
import fr from '../lib/i18n/translations/fr';

function diffKeys(
  source: Record<string, string>,
  target: Record<string, string>
) {
  return Object.keys(source)
    .filter((key) => !(key in target))
    .sort();
}

const missingInFr = diffKeys(en, fr);
const missingInEn = diffKeys(fr, en);

if (missingInFr.length === 0 && missingInEn.length === 0) {
  console.log(
    `i18n key check passed: ${Object.keys(en).length} keys in sync across en/fr.`
  );
  process.exit(0);
}

if (missingInFr.length > 0) {
  console.error('Missing in fr.ts:');
  for (const key of missingInFr) {
    console.error(`- ${key}`);
  }
}

if (missingInEn.length > 0) {
  console.error('Missing in en.ts:');
  for (const key of missingInEn) {
    console.error(`- ${key}`);
  }
}

process.exit(1);
