import JSZip from 'jszip';
import { jsPDF } from 'jspdf';
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

/**
 * Generate a high-resolution canvas certificate image as base64 PNG.
 * Used for both individual PDF generation and 100% reliable fallback.
 */
export async function generateCertificateCanvasImage(student: Student, classGroup?: ClassGroup): Promise<string> {
  const canvas = document.createElement('canvas');
  canvas.width = 1600;
  canvas.height = 1130;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error("Canvas context is not available");

  const dateStr = student.certificateDate || new Date().toISOString().split('T')[0];
  const certNumber = student.certificateNumber || `B1MD-${(student.classId || 'SF').toUpperCase()}-${student.id.slice(-4)}`;
  const certLink = student.certificateLink || 'https://coursera.org/verify/UZB-B1M';

  // 1. Background gradient
  const bgGrad = ctx.createLinearGradient(0, 0, 1600, 1130);
  bgGrad.addColorStop(0, '#0b1329');
  bgGrad.addColorStop(0.5, '#0f172a');
  bgGrad.addColorStop(1, '#1e293b');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, 1600, 1130);

  // 2. Corner decorations and outer gold border
  ctx.strokeStyle = '#f59e0b';
  ctx.lineWidth = 14;
  ctx.strokeRect(30, 30, 1540, 1070);

  // Inner subtle border
  ctx.strokeStyle = 'rgba(245, 158, 11, 0.4)';
  ctx.lineWidth = 2;
  ctx.strokeRect(50, 50, 1500, 1030);

  // Watermark
  ctx.save();
  ctx.beginPath();
  ctx.arc(1350, 850, 350, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(56, 189, 248, 0.03)';
  ctx.fill();
  ctx.restore();

  // 3. Header section
  // 1M Logo box
  const logoGrad = ctx.createLinearGradient(80, 80, 170, 170);
  logoGrad.addColorStop(0, '#0284c7');
  logoGrad.addColorStop(1, '#3b82f6');
  ctx.fillStyle = logoGrad;
  ctx.beginPath();
  ctx.roundRect(80, 80, 90, 90, 16);
  ctx.fill();

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 38px Inter, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('1M', 125, 138);

  // Title text
  ctx.textAlign = 'left';
  ctx.fillStyle = '#f59e0b';
  ctx.font = 'bold 32px Inter, sans-serif';
  ctx.fillText("BIR MILLION O'ZBEK DASTURCHILARI", 195, 120);

  ctx.fillStyle = '#94a3b8';
  ctx.font = '500 20px Inter, sans-serif';
  ctx.fillText("Coursera & Raqamli Ta'lim Hamkorligi Dasturi", 195, 152);

  // Certificate number (top right)
  ctx.textAlign = 'right';
  ctx.fillStyle = '#64748b';
  ctx.font = '600 16px Inter, sans-serif';
  ctx.fillText('SERTIFIKAT RAQAMI:', 1520, 115);
  ctx.fillStyle = '#38bdf8';
  ctx.font = 'bold 22px monospace';
  ctx.fillText(certNumber, 1520, 145);

  // Divider line
  ctx.strokeStyle = 'rgba(245, 158, 11, 0.3)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(80, 200);
  ctx.lineTo(1520, 200);
  ctx.stroke();

  // 4. Certificate Body
  ctx.textAlign = 'center';
  ctx.fillStyle = '#94a3b8';
  ctx.font = 'bold 22px Inter, sans-serif';
  ctx.fillText('M U V A F F A Q I Y A T   S E R T I F I K A T I', 800, 290);

  ctx.fillStyle = '#cbd5e1';
  ctx.font = 'normal 20px Inter, sans-serif';
  ctx.fillText("Ushbu sertifikat quyidagi o'quvchi kursni a'lo baholarga tamomlaganini tasdiqlaydi:", 800, 340);

  // Student Full Name (Large, glowing)
  ctx.fillStyle = '#ffffff';
  ctx.font = '900 52px Inter, sans-serif';
  ctx.fillText(student.fullName, 800, 440);

  // Underline for name
  const nameWidth = ctx.measureText(student.fullName).width;
  ctx.strokeStyle = '#f59e0b';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(800 - nameWidth / 2 - 20, 465);
  ctx.lineTo(800 + nameWidth / 2 + 20, 465);
  ctx.stroke();

  // Description
  ctx.fillStyle = '#e2e8f0';
  ctx.font = 'normal 22px Inter, sans-serif';
  const classText = classGroup ? `${classGroup.name} sinf o'quvchisi. ` : '';
  ctx.fillText(`${classText}"Bir Million Dasturchi" loyihasi doirasida xalqaro Coursera platformasidagi`, 800, 540);
  ctx.font = 'bold 24px Inter, sans-serif';
  ctx.fillStyle = '#38bdf8';
  ctx.fillText('"Frontend Web Development & Algoritmlar"', 800, 580);
  ctx.fillStyle = '#e2e8f0';
  ctx.font = 'normal 22px Inter, sans-serif';
  ctx.fillText("ixtisoslashtirilgan ta'lim dasturini muvaffaqiyatli tamomladi.", 800, 620);

  // 5. Verification and Signatures Footer
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(80, 880);
  ctx.lineTo(1520, 880);
  ctx.stroke();

  // Date & Link (Left)
  ctx.textAlign = 'left';
  ctx.fillStyle = '#94a3b8';
  ctx.font = '600 16px Inter, sans-serif';
  ctx.fillText('BERILGAN SANA:', 80, 930);
  ctx.fillStyle = '#e2e8f0';
  ctx.font = 'bold 22px Inter, sans-serif';
  ctx.fillText(dateStr, 80, 960);

  ctx.fillStyle = '#64748b';
  ctx.font = '500 15px Inter, sans-serif';
  ctx.fillText('Elektron tekshiruv havolasi:', 80, 1000);
  ctx.fillStyle = '#38bdf8';
  ctx.font = '500 17px monospace';
  const displayLink = certLink.length > 55 ? certLink.slice(0, 52) + '...' : certLink;
  ctx.fillText(displayLink, 80, 1025);

  // Digital Seal (Center)
  ctx.save();
  ctx.translate(800, 970);
  ctx.rotate(-0.1);
  ctx.strokeStyle = '#f59e0b';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(0, 0, 60, 0, Math.PI * 2);
  ctx.stroke();

  ctx.fillStyle = 'rgba(245, 158, 11, 0.08)';
  ctx.fill();

  ctx.fillStyle = '#f59e0b';
  ctx.font = 'bold 15px Inter, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('★ TASDIQLANGAN ★', 0, -10);
  ctx.font = '600 13px Inter, sans-serif';
  ctx.fillText('RAQAMLI MUHR', 0, 15);
  ctx.restore();

  // Signatures (Right)
  ctx.textAlign = 'right';
  ctx.fillStyle = '#e2e8f0';
  ctx.font = 'bold 20px Inter, sans-serif';
  ctx.fillText('Loyiha Koordinatori', 1520, 930);
  ctx.fillStyle = '#94a3b8';
  ctx.font = '500 16px Inter, sans-serif';
  ctx.fillText("O'zbekiston IT-Hamjamiyati", 1520, 958);

  ctx.font = 'italic 26px cursive, sans-serif';
  ctx.fillStyle = '#38bdf8';
  ctx.fillText('Verified & Approved', 1520, 1010);

  return canvas.toDataURL('image/png');
}

/**
 * Generate a standalone single-student PDF document using jsPDF.
 */
export async function generateSingleStudentPdf(student: Student, classGroup?: ClassGroup): Promise<jsPDF> {
  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4',
  });

  const imgData = await generateCertificateCanvasImage(student, classGroup);
  // Fit 297 x 210 mm
  doc.addImage(imgData, 'PNG', 5, 5, 287, 200, undefined, 'FAST');
  return doc;
}

/**
 * Generate ZIP file of all certificates for the class, with both individual PDF and HTML.
 */
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

  const total = certifiedStudents.length;

  for (let index = 0; index < total; index++) {
    const student = certifiedStudents[index];

    summaryText += `${index + 1}. ${student.fullName}\n`;
    summaryText += `   ID/Pasport: ${student.passportOrId || 'Mavjud emas'}\n`;
    summaryText += `   Havola: ${student.certificateLink || 'Mavjud emas'}\n`;
    summaryText += `   Email: ${student.assignedEmail || 'Mavjud emas'}\n\n`;

    // 1. Individual PDF file
    try {
      const studentPdf = await generateSingleStudentPdf(student, classGroup);
      const pdfBlob = studentPdf.output('blob');
      const safePdfName = `${index + 1}_${student.fullName.replace(/[^a-zA-Z0-9_\u0400-\u04FF]/g, '_')}.pdf`;
      folder?.file(safePdfName, pdfBlob);
    } catch (e) {
      console.warn("Single student PDF error:", e);
    }

    // 2. Individual HTML file
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
    const safeHtmlName = `${index + 1}_${student.fullName.replace(/[^a-zA-Z0-9_\u0400-\u04FF]/g, '_')}.html`;
    folder?.file(safeHtmlName, certHTML);

    if (onProgress) {
      onProgress(Math.round(((index + 1) / total) * 90));
    }
  }

  folder?.file('RO\'YXAT_VA_HAVOLALAR.txt', summaryText);

  // Generate ZIP
  const content = await zip.generateAsync({ type: 'blob' }, (metadata) => {
    if (onProgress) {
      onProgress(Math.min(99, 90 + Math.round(metadata.percent * 0.1)));
    }
  });

  // Trigger download
  const url = URL.createObjectURL(content);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${classGroup.name}_sinf_sertifikatlari_to'plami.zip`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Capture certificate image from external URL through backend proxy.
 */
export async function captureCertificateFromLink(
  url: string,
  studentName?: string,
  className?: string
): Promise<string | null> {
  if (!url || typeof url !== 'string' || url.trim().length < 5) {
    return null;
  }

  try {
    const res = await fetch('/api/capture-certificate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: url.trim(),
        studentName,
        className,
      }),
    });

    if (!res.ok) return null;
    const data = await res.json();
    if (data.success && data.imageBase64) {
      return data.imageBase64;
    }
    return null;
  } catch (err) {
    console.warn("captureCertificateFromLink failed:", err);
    return null;
  }
}

/**
 * FEATURE 2:
 * Generate a single unified PDF containing all student certificates
 * captured from their actual links, sorted strictly alphabetically by surname!
 */
export async function generateUnifiedCertificatesPdf(
  students: Student[],
  classGroup: ClassGroup,
  onProgress?: (statusText: string, current: number, total: number) => void
): Promise<{ filename: string; blob: Blob } | null> {
  const certifiedStudents = students.filter(s => s.status === 'certified' && s.classId === classGroup.id);
  
  if (certifiedStudents.length === 0) {
    alert("Bu sinfda hali sertifikat olgan o'quvchilar yo'q!");
    return null;
  }

  // 1. Sort strictly alphabetically by student surname / full name (Familya bo'yicha ketma-ket)
  const sortedStudents = [...certifiedStudents].sort((a, b) => {
    return a.fullName.trim().localeCompare(b.fullName.trim(), 'uz', { sensitivity: 'base' });
  });

  const total = sortedStudents.length;

  // Initialize jsPDF in A4 landscape mode (297 x 210 mm)
  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4',
  });

  for (let i = 0; i < total; i++) {
    const student = sortedStudents[i];

    if (onProgress) {
      onProgress(
        `"${student.fullName}" sertifikati olinmoqda (${i + 1}/${total})...`,
        i + 1,
        total
      );
    }

    if (i > 0) {
      doc.addPage('a4', 'landscape');
    }

    // Attempt to capture real certificate image from external link
    let certificateImage: string | null = null;
    if (student.certificateLink) {
      certificateImage = await captureCertificateFromLink(
        student.certificateLink,
        student.fullName,
        classGroup.name
      );
    }

    // Guaranteed fallback: If external image capture fails or offline, use high-resolution canvas certificate!
    if (!certificateImage) {
      certificateImage = await generateCertificateCanvasImage(student, classGroup);
    }

    // Page Design (Executive Apple Clean Pro Layout):
    // 1. Top Bar Banner
    doc.setFillColor(15, 23, 42); // slate-900
    doc.rect(0, 0, 297, 16, 'F');

    // Accent line
    doc.setFillColor(245, 158, 11); // amber-500
    doc.rect(0, 16, 297, 1.2, 'F');

    // Student Number and Full Name (Left)
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.text(`${i + 1}. ${student.fullName}`, 12, 11);

    // Class Name & Teacher (Right)
    doc.setTextColor(251, 191, 36); // amber-400
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    const teacherMeta = `${classGroup.name} sinfi | Sinf rahbari: ${classGroup.teacherName}`;
    doc.text(teacherMeta, 285, 11, { align: 'right' });

    // 2. Main Certificate Image in Center (Exact aspect-ratio preserved)
    let imageW = 277;
    let imageH = 175;
    let imageX = 10;
    let imageY = 20;

    try {
      const dimensions = await new Promise<{ w: number; h: number }>((resolve) => {
        const img = new Image();
        img.onload = () => {
          resolve({ w: img.naturalWidth || img.width || 1772, h: img.naturalHeight || img.height || 928 });
        };
        img.onerror = () => resolve({ w: 1772, h: 928 });
        img.src = certificateImage!;
      });

      const maxW = 279;
      const maxH = 176;
      const aspect = dimensions.w / dimensions.h;

      imageW = maxW;
      imageH = imageW / aspect;
      if (imageH > maxH) {
        imageH = maxH;
        imageW = imageH * aspect;
      }

      imageX = (297 - imageW) / 2;
      imageY = 18 + (178 - imageH) / 2;
    } catch {
      // Keep default values
    }

    // Outer subtle border around image
    doc.setDrawColor(226, 232, 240); // slate-200
    doc.setLineWidth(0.4);
    doc.rect(imageX - 0.5, imageY - 0.5, imageW + 1, imageH + 1);

    try {
      const format = certificateImage.startsWith('data:image/png') ? 'PNG' : 'JPEG';
      doc.addImage(certificateImage, format, imageX, imageY, imageW, imageH, undefined, 'FAST');
    } catch (e) {
      console.warn("Failed to add captured image, falling back to canvas:", e);
      const fallbackImg = await generateCertificateCanvasImage(student, classGroup);
      doc.addImage(fallbackImg, 'PNG', imageX, imageY, imageW, imageH, undefined, 'FAST');
    }

    // 3. Page Footer Bar
    doc.setFillColor(248, 250, 252); // slate-50
    doc.rect(0, 199, 297, 11, 'F');
    doc.setDrawColor(203, 213, 225); // slate-300
    doc.setLineWidth(0.3);
    doc.line(0, 199, 297, 199);

    // Footer Left: Verification Link
    doc.setTextColor(71, 85, 105);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    const linkStr = student.certificateLink || 'https://coursera.org/verify';
    const displayLink = linkStr.length > 90 ? linkStr.slice(0, 87) + '...' : linkStr;
    doc.text(`Elektron tasdiq: ${displayLink}`, 12, 206);

    // Footer Right: Page info
    doc.setTextColor(30, 41, 59);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text(`Sahifa ${i + 1} / ${total}`, 285, 206, { align: 'right' });
  }

  // Save the unified multi-page PDF
  const cleanClassName = classGroup.name.replace(/[^a-zA-Z0-9_\u0400-\u04FF]/g, '_');
  const filename = `${cleanClassName}_sinfi_barcha_sertifikatlar_yagona_royxati.pdf`;
  doc.save(filename);
  const blob = doc.output('blob');
  return { filename, blob };
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
