import JSZip from 'jszip';
import { Student, ClassGroup } from '../types';

export function generateCertificateHTML(student: Student, classGroup?: ClassGroup): string {
  const dateStr = student.certificateDate || new Date().toISOString().split('T')[0];
  const certNumber = student.certificateNumber || `B1MD-${student.classId.toUpperCase()}-${student.id.slice(-4)}`;
  const certLink = student.certificateLink || 'https://coursera.org/verify/UZB-B1M';

  return `
    <div style="width: 800px; height: 565px; padding: 35px; box-sizing: border-box; background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%); color: #fff; font-family: 'Inter', system-ui, sans-serif; position: relative; border-radius: 12px; border: 8px solid #f59e0b; box-shadow: 0 20px 40px rgba(0,0,0,0.5); overflow: hidden;">
      <!-- Background watermark -->
      <div style="position: absolute; right: -50px; bottom: -50px; width: 350px; height: 350px; opacity: 0.05; border-radius: 50%; background: #38bdf8;"></div>
      
      <!-- Top banner -->
      <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid rgba(245,158,11,0.3); padding-bottom: 16px;">
        <div style="display: flex; align-items: center; gap: 12px;">
          <div style="width: 48px; height: 48px; border-radius: 10px; background: linear-gradient(135deg, #0284c7, #3b82f6); display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 20px;">
            1M
          </div>
          <div>
            <div style="font-size: 16px; font-weight: 800; letter-spacing: 1px; color: #f59e0b; text-transform: uppercase;">
              Bir Million O'zbek Dasturchilari
            </div>
            <div style="font-size: 11px; color: #94a3b8;">
              Coursera & Raqamli Ta'lim Hamkorligi Dasturi
            </div>
          </div>
        </div>
        <div style="text-align: right;">
          <div style="font-size: 10px; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px;">Sertifikat raqami:</div>
          <div style="font-size: 13px; font-weight: 700; color: #38bdf8; font-family: monospace;">${certNumber}</div>
        </div>
      </div>

      <!-- Main body -->
      <div style="text-align: center; margin-top: 25px;">
        <div style="font-size: 13px; text-transform: uppercase; letter-spacing: 3px; color: #94a3b8; font-weight: 600;">
          Muvaffaqiyat Sertifikati
        </div>
        <div style="font-size: 11px; color: #cbd5e1; margin-top: 4px;">
          Ushbu sertifikat quyidagi o'quvchi kursni a'lo baholarga tamomlaganini tasdiqlaydi:
        </div>

        <div style="font-size: 26px; font-weight: 900; color: #ffffff; margin: 18px 0 10px; letter-spacing: 0.5px; border-bottom: 2px dashed #475569; display: inline-block; padding: 0 25px 6px;">
          ${student.fullName}
        </div>

        <div style="font-size: 12px; color: #cbd5e1; max-width: 600px; margin: 0 auto; line-height: 1.5;">
          ${classGroup ? `<b>${classGroup.name}</b> sinf o'quvchisi.` : ''} "Bir Million Dasturchi" loyihasi doirasida xalqaro Coursera platformasidagi <b>"Frontend Web Development & Algoritmlar"</b> ixtisoslashtirilgan ta'lim dasturini muvaffaqiyatli tamomladi.
        </div>
      </div>

      <!-- Verification and Signatures -->
      <div style="display: flex; justify-content: space-between; align-items: flex-end; margin-top: 35px; padding-top: 15px; border-top: 1px solid rgba(255,255,255,0.1);">
        <div>
          <div style="font-size: 10px; color: #94a3b8;">Berilgan sana:</div>
          <div style="font-size: 12px; font-weight: 600; color: #e2e8f0;">${dateStr}</div>
          <div style="margin-top: 8px; font-size: 9px; color: #64748b;">
            Elektron tekshiruv havolasi:<br/>
            <a href="${certLink}" style="color: #38bdf8; text-decoration: none;" target="_blank">${certLink}</a>
          </div>
        </div>

        <div style="text-align: center;">
          <div style="width: 70px; height: 70px; border: 2px solid #f59e0b; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 9px; color: #f59e0b; font-weight: bold; text-transform: uppercase; transform: rotate(-10deg); background: rgba(245,158,11,0.05); margin: 0 auto;">
            ★ TASDIQLANGAN ★
          </div>
          <div style="font-size: 10px; color: #94a3b8; margin-top: 4px;">Raqamli Muhr</div>
        </div>

        <div style="text-align: right;">
          <div style="font-size: 12px; font-weight: 700; color: #e2e8f0;">Loyiha Koordinatori</div>
          <div style="font-size: 10px; color: #94a3b8; margin-top: 2px;">O'zbekiston IT-Hamjamiyati</div>
          <div style="margin-top: 12px; font-family: cursive; font-size: 15px; color: #38bdf8;">Verified & Approved</div>
        </div>
      </div>
    </div>
  `;
}

// Print single certificate
export function printCertificate(student: Student, classGroup?: ClassGroup) {
  const printWindow = window.open('', '_blank');
  if (!printWindow) return;

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <title>Sertifikat - ${student.fullName}</title>
        <style>
          @page { size: landscape; margin: 0; }
          body { margin: 0; display: flex; align-items: center; justify-content: center; min-height: 100vh; background: #000; }
          @media print {
            body { background: transparent; }
          }
        </style>
      </head>
      <body>
        ${generateCertificateHTML(student, classGroup)}
        <script>
          window.onload = function() {
            window.print();
          };
        </script>
      </body>
    </html>
  `;

  printWindow.document.write(html);
  printWindow.document.close();
}

// Print all class certificates in a single consolidated printable document
export function printAllClassCertificates(students: Student[], classGroup: ClassGroup) {
  const certifiedStudents = students.filter(s => s.status === 'certified' && s.classId === classGroup.id);
  if (certifiedStudents.length === 0) return;

  const printWindow = window.open('', '_blank');
  if (!printWindow) return;

  const itemsHTML = certifiedStudents.map(student => `
    <div style="page-break-after: always; display: flex; align-items: center; justify-content: center; height: 100vh; width: 100vw; box-sizing: border-box; padding: 20px;">
      ${generateCertificateHTML(student, classGroup)}
    </div>
  `).join('');

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <title>${classGroup.name} Sinf Sertifikatlari</title>
        <style>
          @page { size: landscape; margin: 0; }
          body { margin: 0; background: #090d16; }
          @media print {
            body { background: transparent; }
          }
        </style>
      </head>
      <body>
        ${itemsHTML}
        <script>
          window.onload = function() {
            window.print();
          };
        </script>
      </body>
    </html>
  `;

  printWindow.document.write(html);
  printWindow.document.close();
}

// Generate ZIP file of all certificates for the class
export async function downloadAllCertificatesAsZip(
  students: Student[],
  classGroup: ClassGroup,
  onProgress?: (percent: number) => void
): Promise<void> {
  const certifiedStudents = students.filter(s => s.status === 'certified' && s.classId === classGroup.id);
  if (certifiedStudents.length === 0) {
    alert("Bu sinfda hali sertifikat olgan o'quvchilar yo'q!");
    return;
  }

  const zip = new JSZip();
  const folder = zip.folder(`${classGroup.name}_sinf_sertifikatlari`);

  // Text summary file
  let summaryText = `====================================================\n`;
  summaryText += `  ${classGroup.name} SINF - BIR MILLION DASTURCHI SERTIFIKATLARI\n`;
  summaryText += `  Sinf rahbari: ${classGroup.teacherName}\n`;
  summaryText += `  Jami sertifikatlar: ${certifiedStudents.length} ta\n`;
  summaryText += `  Sana: ${new Date().toLocaleDateString('uz-UZ')}\n`;
  summaryText += `====================================================\n\n`;

  certifiedStudents.forEach((student, index) => {
    summaryText += `${index + 1}. ${student.fullName}\n`;
    summaryText += `   ID/Pasport: ${student.passportOrId || 'Mavjud emas'}\n`;
    summaryText += `   Havola: ${student.certificateLink || 'Mavjud emas'}\n`;
    summaryText += `   Email: ${student.assignedEmail || 'Mavjud emas'}\n\n`;

    // Each individual certificate HTML file
    const certHTML = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>${student.fullName} - Sertifikat</title>
          <style>
            body { margin: 0; background: #0f172a; display: flex; align-items: center; justify-content: center; min-height: 100vh; padding: 20px; font-family: sans-serif; }
          </style>
        </head>
        <body>
          ${generateCertificateHTML(student, classGroup)}
        </body>
      </html>
    `;

    // Clean filename
    const safeName = `${index + 1}_${student.fullName.replace(/[^a-zA-Z0-9_\u0400-\u04FF]/g, '_')}.html`;
    folder?.file(safeName, certHTML);
  });

  folder?.file('RO\'YXAT_VA_HAVOLALAR.txt', summaryText);

  // Generate ZIP
  const content = await zip.generateAsync({ type: 'blob' }, (metadata) => {
    if (onProgress) {
      onProgress(metadata.percent);
    }
  });

  // Trigger download
  const url = URL.createObjectURL(content);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${classGroup.name}_sinf_sertifikatlari.zip`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Format all student certificates into clipboard-ready text
export function formatClassCertificatesForClipboard(students: Student[], classGroup: ClassGroup): string {
  const certified = students.filter(s => s.status === 'certified' && s.classId === classGroup.id);
  
  if (certified.length === 0) {
    return `${classGroup.name} sinfida hali sertifikat olgan o'quvchilar yo'q.`;
  }

  let text = `🎓 ${classGroup.name} sinf o'quvchilarining "Bir Million Dasturchi" sertifikatlari ro'yxati:\n`;
  text += `👩‍🏫 Sinf rahbari: ${classGroup.teacherName}\n`;
  text += `📊 Jami sertifikat olganlar: ${certified.length} nafar\n\n`;

  certified.forEach((st, idx) => {
    text += `${idx + 1}. ${st.fullName}\n   🔗 Havola: ${st.certificateLink || 'Mavjud emas'}\n`;
  });

  return text;
}
