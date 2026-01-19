"""
PDF Invoice Generator Service.

Generates professional PDF invoices using reportlab.
"""
from io import BytesIO
from datetime import date
from typing import Optional

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle


class InvoicePDFGenerator:
    """Generates PDF invoices."""
    
    def __init__(self):
        self.styles = getSampleStyleSheet()
        self._setup_custom_styles()
    
    def _setup_custom_styles(self):
        """Setup custom paragraph styles."""
        self.styles.add(ParagraphStyle(
            name='CompanyName',
            fontSize=18,
            fontName='Helvetica-Bold',
            textColor=colors.HexColor('#333333')
        ))
        self.styles.add(ParagraphStyle(
            name='InvoiceTitle',
            fontSize=24,
            fontName='Helvetica-Bold',
            textColor=colors.HexColor('#2c3e50'),
            spaceAfter=20
        ))
        self.styles.add(ParagraphStyle(
            name='SectionHeader',
            fontSize=12,
            fontName='Helvetica-Bold',
            textColor=colors.HexColor('#34495e'),
            spaceBefore=15,
            spaceAfter=5
        ))
    
    def generate(
        self,
        invoice_number: str,
        client_name: str,
        client_address: Optional[str],
        issue_date: date,
        due_date: date,
        items: list,
        subtotal: float,
        tax_rate: float,
        tax_amount: float,
        discount_amount: float,
        total: float,
        currency: str = "USD",
        notes: Optional[str] = None,
        terms: Optional[str] = None,
        company_name: str = "Bedrock Forge",
        company_address: str = ""
    ) -> bytes:
        """
        Generate PDF invoice.
        
        Returns: PDF content as bytes
        """
        buffer = BytesIO()
        doc = SimpleDocTemplate(
            buffer,
            pagesize=A4,
            rightMargin=20*mm,
            leftMargin=20*mm,
            topMargin=20*mm,
            bottomMargin=20*mm
        )
        
        elements = []
        
        # Header with company name and invoice title
        elements.append(Paragraph(company_name, self.styles['CompanyName']))
        elements.append(Spacer(1, 5*mm))
        elements.append(Paragraph("INVOICE", self.styles['InvoiceTitle']))
        
        # Invoice details table
        invoice_info = [
            ["Invoice Number:", invoice_number],
            ["Issue Date:", issue_date.strftime("%B %d, %Y")],
            ["Due Date:", due_date.strftime("%B %d, %Y")],
        ]
        
        info_table = Table(invoice_info, colWidths=[80, 150])
        info_table.setStyle(TableStyle([
            ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, -1), 10),
            ('TEXTCOLOR', (0, 0), (0, -1), colors.HexColor('#7f8c8d')),
            ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
        ]))
        elements.append(info_table)
        elements.append(Spacer(1, 10*mm))
        
        # Bill To section
        elements.append(Paragraph("Bill To:", self.styles['SectionHeader']))
        elements.append(Paragraph(client_name, self.styles['Normal']))
        if client_address:
            for line in client_address.split('\n'):
                elements.append(Paragraph(line, self.styles['Normal']))
        elements.append(Spacer(1, 10*mm))
        
        # Items table
        elements.append(Paragraph("Items:", self.styles['SectionHeader']))
        
        # Table header
        table_data = [
            ["Description", "Qty", "Unit Price", "Total"]
        ]
        
        # Add items
        for item in items:
            table_data.append([
                item.get('description', ''),
                str(item.get('quantity', 1)),
                f"{currency} {item.get('unit_price', 0):.2f}",
                f"{currency} {item.get('total', 0):.2f}"
            ])
        
        # Add summary rows
        table_data.append(["", "", "Subtotal:", f"{currency} {subtotal:.2f}"])
        if discount_amount > 0:
            table_data.append(["", "", "Discount:", f"-{currency} {discount_amount:.2f}"])
        if tax_rate > 0:
            table_data.append(["", "", f"Tax ({tax_rate}%):", f"{currency} {tax_amount:.2f}"])
        table_data.append(["", "", "Total:", f"{currency} {total:.2f}"])
        
        items_table = Table(table_data, colWidths=[250, 50, 80, 80])
        items_table.setStyle(TableStyle([
            # Header
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#3498db')),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, 0), 10),
            ('BOTTOMPADDING', (0, 0), (-1, 0), 8),
            ('TOPPADDING', (0, 0), (-1, 0), 8),
            
            # Body
            ('FONTSIZE', (0, 1), (-1, -1), 9),
            ('BOTTOMPADDING', (0, 1), (-1, -1), 6),
            ('TOPPADDING', (0, 1), (-1, -1), 6),
            
            # Alternating rows
            ('ROWBACKGROUNDS', (0, 1), (-1, -5), [colors.white, colors.HexColor('#f8f9fa')]),
            
            # Summary section
            ('FONTNAME', (2, -4), (2, -1), 'Helvetica-Bold'),
            ('BACKGROUND', (2, -1), (-1, -1), colors.HexColor('#ecf0f1')),
            ('FONTNAME', (2, -1), (-1, -1), 'Helvetica-Bold'),
            
            # Alignment
            ('ALIGN', (1, 0), (-1, -1), 'RIGHT'),
            
            # Borders
            ('LINEBELOW', (0, 0), (-1, 0), 1, colors.HexColor('#2980b9')),
            ('LINEBELOW', (0, -5), (-1, -5), 0.5, colors.HexColor('#bdc3c7')),
        ]))
        
        elements.append(items_table)
        elements.append(Spacer(1, 15*mm))
        
        # Notes and Terms
        if notes:
            elements.append(Paragraph("Notes:", self.styles['SectionHeader']))
            elements.append(Paragraph(notes, self.styles['Normal']))
            elements.append(Spacer(1, 5*mm))
        
        if terms:
            elements.append(Paragraph("Terms:", self.styles['SectionHeader']))
            elements.append(Paragraph(terms, self.styles['Normal']))
        
        # Build PDF
        doc.build(elements)
        
        pdf_content = buffer.getvalue()
        buffer.close()
        
        return pdf_content


# Singleton instance
invoice_pdf_generator = InvoicePDFGenerator()
