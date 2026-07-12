import PDFDocument from 'pdfkit';
import path from 'path';
import fs from 'fs';
import { prisma } from '../utils/prisma';
import { logger } from '../utils/logger';

const LOGO_PATH = path.join(__dirname, '../assets/logo-full.png');

// Invoice numbers look like CB-2026-000123 — sequential per year, easy for
// a human (or an accountant) to read and reference.
export async function generateInvoiceNumber(): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `CB-${year}-`;

  const last = await prisma.invoice.findFirst({
    where: { invoiceNumber: { startsWith: prefix } },
    orderBy: { invoiceNumber: 'desc' },
  });

  const lastSeq = last ? parseInt(last.invoiceNumber.slice(prefix.length), 10) : 0;
  const nextSeq = (lastSeq + 1).toString().padStart(6, '0');
  return `${prefix}${nextSeq}`;
}

interface InvoicePdfData {
  invoiceNumber: string;
  issuedAt: Date;
  dueAt: Date | null;
  status: string;
  customerName: string;
  customerEmail: string;
  itemDescription: string;
  amount: number;
  currency: string;
}

// Renders a simple, clean one-page invoice PDF with the CoinBidex logo.
// Returns a Buffer so callers can either stream it as a download or attach
// it to an email — no temp files on disk.
export function renderInvoicePdf(data: InvoicePdfData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', margin: 50 });
      const chunks: Buffer[] = [];
      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      // Header: logo + invoice meta
      if (fs.existsSync(LOGO_PATH)) {
        doc.image(LOGO_PATH, 50, 45, { width: 160 });
      } else {
        doc.fontSize(20).font('Helvetica-Bold').text('CoinBidex', 50, 50);
      }

      doc.fontSize(20).font('Helvetica-Bold').text('INVOICE', 400, 50, { align: 'right' });
      doc.fontSize(10).font('Helvetica').fillColor('#555')
        .text(`Invoice #: ${data.invoiceNumber}`, 400, 78, { align: 'right' })
        .text(`Issued: ${data.issuedAt.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`, 400, 92, { align: 'right' })
        .text(`Due: ${data.dueAt ? data.dueAt.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : 'On receipt'}`, 400, 106, { align: 'right' });

      doc.moveDown(4);
      doc.moveTo(50, 140).lineTo(545, 140).strokeColor('#e5e8f0').stroke();

      // Bill-to
      doc.fillColor('#000').fontSize(11).font('Helvetica-Bold').text('Billed to', 50, 155);
      doc.font('Helvetica').fontSize(10).fillColor('#333')
        .text(data.customerName, 50, 172)
        .text(data.customerEmail, 50, 186);

      // Status badge
      const statusColor = data.status === 'PAID' ? '#16a34a' : data.status === 'CANCELLED' || data.status === 'EXPIRED' ? '#dc2626' : '#d97706';
      doc.font('Helvetica-Bold').fontSize(11).fillColor(statusColor)
        .text(data.status, 400, 155, { align: 'right' });

      // Line item table
      const tableTop = 230;
      doc.font('Helvetica-Bold').fontSize(10).fillColor('#555')
        .text('Description', 50, tableTop)
        .text('Amount', 450, tableTop, { align: 'right' });
      doc.moveTo(50, tableTop + 18).lineTo(545, tableTop + 18).strokeColor('#e5e8f0').stroke();

      doc.font('Helvetica').fontSize(10).fillColor('#000')
        .text(data.itemDescription, 50, tableTop + 30, { width: 380 })
        .text(`${data.currency} ${data.amount.toFixed(2)}`, 450, tableTop + 30, { align: 'right' });

      doc.moveTo(50, tableTop + 70).lineTo(545, tableTop + 70).strokeColor('#e5e8f0').stroke();

      doc.font('Helvetica-Bold').fontSize(12)
        .text('Total', 350, tableTop + 85)
        .text(`${data.currency} ${data.amount.toFixed(2)}`, 450, tableTop + 85, { align: 'right' });

      // Footer
      doc.fontSize(8).fillColor('#999').text(
        'CoinBidex — this invoice was generated automatically. Questions? billing@coinbidex.com',
        50, 750, { align: 'center', width: 495 }
      );

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

export async function createInvoice(params: {
  userId: string;
  packageId: string;
  amount: number;
  listingId?: string;
  advertisementId?: string;
  dueInDays?: number;
}) {
  const invoiceNumber = await generateInvoiceNumber();
  const dueAt = new Date(Date.now() + (params.dueInDays ?? 7) * 24 * 60 * 60 * 1000);

  const invoice = await prisma.invoice.create({
    data: {
      invoiceNumber,
      userId: params.userId,
      packageId: params.packageId,
      listingId: params.listingId,
      advertisementId: params.advertisementId,
      amount: params.amount,
      status: 'PENDING',
      dueAt,
    },
  });

  logger.info(`Invoice ${invoiceNumber} created for user ${params.userId}: $${params.amount}`);
  return invoice;
}
