import { validateExamDefinition } from './examRules.js';

export function examDefinitionTemplate() {
  const definition = validateExamDefinition({
    title: { tr: 'Örnek muhasebe sınavı', en: 'Example accounting exam' },
    description: { tr: 'Örnek soruları kendi sınavınıza göre düzenleyin.', en: 'Edit the example questions for your exam.' },
    difficulty: 'easy',
    difficultyRating: 100,
    timeLimitSeconds: 300,
    questions: [
      {
        id: 'soru1', type: 'choice', points: 40,
        prompt: { tr: 'Nakit hangi hesapta izlenir?', en: 'Which account tracks cash?' },
        options: [
          { id: 'a', text: { tr: '100 Kasa', en: '100 Cash' } },
          { id: 'b', text: { tr: '102 Bankalar', en: '102 Banks' } },
        ],
        answer: 'a',
      },
      {
        id: 'soru2', type: 'journal', points: 60,
        prompt: { tr: '1.000 TL peşin satış ve 200 TL KDV kaydını oluşturun.', en: 'Record a cash sale of TRY 1,000 plus TRY 200 VAT.' },
        answer: [
          { accountCode: '100', side: 'debit', amount: '1200' },
          { accountCode: '600', side: 'credit', amount: '1000' },
          { accountCode: '391', side: 'credit', amount: '200' },
        ],
      },
    ],
  });
  return new Blob([JSON.stringify(definition, null, 2), '\n'], { type: 'application/json;charset=utf-8' });
}

export function questionDataTemplate() {
  return new Blob(['\ufeffislem_no;aciklama;tutar_tl;kdv_orani\r\n1;Ornek pesin satis;1000;20\r\n'], { type: 'text/csv;charset=utf-8' });
}

export async function encodeExamFiles(files) {
  if (files.length > 5 || files.some(file => !file.size || file.size > 5 * 1024 * 1024) ||
      files.reduce((total, file) => total + file.size, 0) > 10 * 1024 * 1024) {
    throw new Error('En fazla 5 dosya; dosyalar boş olamaz, dosya başına 5 MiB ve toplam 10 MiB sınırıdır / Invalid file count or size');
  }
  return Promise.all(files.map(async file => {
    if (!/^[a-zA-Z0-9._-]{1,100}$/.test(file.name) || !/\.(pdf|csv)$/i.test(file.name)) {
      throw new Error(`Geçersiz dosya adı veya türü / Invalid filename or type: ${file.name}`);
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    const contentType = file.name.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'text/csv';
    return { filename: file.name, contentType, base64: btoa(binary) };
  }));
}

export function downloadAuthorFile(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
