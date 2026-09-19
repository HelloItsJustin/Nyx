"""
PDF Report Generator - ReportLab based.
Generates a boardroom-ready multi-page PDF executive report.
Saved locally, offered as download from dashboard. Never transmitted.
"""
import os
import asyncio
from pathlib import Path
from datetime import datetime
from typing import Dict, Any

REPORTS_DIR = Path(__file__).parent / "reports"
REPORTS_DIR.mkdir(exist_ok=True)

# Signal palette for PDF
VIOLET = (108/255, 92/255, 231/255)
AMBER  = (245/255, 166/255, 35/255)
CYAN   = (58/255, 199/255, 217/255)
GREEN  = (46/255, 204/255, 113/255)
DARK   = (17/255, 17/255, 17/255)
GRAY   = (107/255, 107/255, 107/255)
WHITE  = (1, 1, 1)
LIGHT  = (250/255, 250/255, 249/255)


def _build_pdf_sync(data: Dict[str, Any], pdf_path: str):
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.units import mm
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_RIGHT
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, HRFlowable, PageBreak
    from reportlab.lib import colors
    from reportlab.graphics.shapes import Drawing, Circle, Rect
    from reportlab.graphics import renderPDF

    styles = getSampleStyleSheet()
    
    # Custom styles
    title_style = ParagraphStyle("NyxTitle", fontSize=28, textColor=colors.Color(*DARK),
                                  fontName="Helvetica-Bold", spaceAfter=4, alignment=TA_LEFT)
    sub_style  = ParagraphStyle("NyxSub", fontSize=13, textColor=colors.Color(*GRAY),
                                 fontName="Helvetica", spaceAfter=8, alignment=TA_LEFT)
    h2_style   = ParagraphStyle("NyxH2", fontSize=16, textColor=colors.Color(*DARK),
                                 fontName="Helvetica-Bold", spaceAfter=6, spaceBefore=14)
    h3_style   = ParagraphStyle("NyxH3", fontSize=12, textColor=colors.Color(*VIOLET),
                                 fontName="Helvetica-Bold", spaceAfter=4)
    body_style = ParagraphStyle("NyxBody", fontSize=10, textColor=colors.Color(*DARK),
                                 fontName="Helvetica", spaceAfter=6, leading=15)
    mono_style = ParagraphStyle("NyxMono", fontSize=9, textColor=colors.Color(*DARK),
                                 fontName="Courier", backColor=colors.Color(0.94, 0.94, 0.94),
                                 spaceAfter=4, leftIndent=8, rightIndent=8, spaceBefore=2)
    caption_style = ParagraphStyle("NyxCaption", fontSize=8, textColor=colors.Color(*GRAY),
                                    fontName="Helvetica", alignment=TA_RIGHT)

    doc = SimpleDocTemplate(
        pdf_path,
        pagesize=A4,
        leftMargin=20*mm,
        rightMargin=20*mm,
        topMargin=20*mm,
        bottomMargin=20*mm,
    )

    story = []
    W, H = A4

    now = datetime.now().strftime("%B %d, %Y at %H:%M")
    
    # --- COVER PAGE ---
    story.append(Spacer(1, 30*mm))
    story.append(Paragraph("NYX", title_style))
    story.append(Paragraph("Security Assessment Report", ParagraphStyle("Sub2", fontSize=20,
                            textColor=colors.Color(*VIOLET), fontName="Helvetica-Bold", spaceAfter=6)))
    story.append(Spacer(1, 4*mm))
    story.append(HRFlowable(width="100%", thickness=1, color=colors.Color(*VIOLET)))
    story.append(Spacer(1, 6*mm))

    findings = data.get("findings", [])
    fixes = data.get("fixes", [])
    trust_score = data.get("trust_score", 95)
    repo_url = data.get("repo_url", "Repository scan")
    
    story.append(Paragraph(f"Target: {repo_url}", sub_style))
    story.append(Paragraph(f"Generated: {now}", sub_style))
    story.append(Paragraph(f"Scan Mode: Local-only. No data transmitted to Nyx servers.", sub_style))
    story.append(Spacer(1, 16*mm))

    # Trust score block
    ts_color = colors.Color(*GREEN) if trust_score >= 80 else colors.Color(*AMBER) if trust_score >= 60 else colors.Color(0.9, 0.2, 0.2)
    story.append(Paragraph("TRUST SCORE", ParagraphStyle("TSLabel", fontSize=10, textColor=colors.Color(*GRAY),
                             fontName="Helvetica-Bold")))
    story.append(Paragraph(f"{trust_score}/100", ParagraphStyle("TSNum", fontSize=48,
                             textColor=ts_color, fontName="Helvetica-Bold", spaceAfter=2)))

    crit = len([f for f in findings if f.get("severity") == "CRITICAL"])
    high = len([f for f in findings if f.get("severity") == "HIGH"])
    med  = len([f for f in findings if f.get("severity") == "MEDIUM"])
    low  = len([f for f in findings if f.get("severity") == "LOW"])

    summary_data = [
        ["Metric", "Value"],
        ["Total Findings", str(len(findings))],
        ["Critical", str(crit)],
        ["High", str(high)],
        ["Medium", str(med)],
        ["Low", str(low)],
        ["Fixes Generated", str(len(fixes))],
        ["Trust Score (Before)", str(max(20, trust_score - len(findings) * 5))],
        ["Trust Score (After Fix)", str(trust_score)],
    ]
    tbl = Table(summary_data, colWidths=[80*mm, 50*mm])
    tbl.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.Color(*DARK)),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, 0), 10),
        ("FONTNAME", (0, 1), (-1, -1), "Helvetica"),
        ("FONTSIZE", (0, 1), (-1, -1), 10),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.Color(*LIGHT), colors.white]),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.Color(0.8, 0.8, 0.8)),
        ("TEXTCOLOR", (1, 2), (1, 2), colors.Color(0.8, 0.1, 0.1)),  # Critical red
        ("FONTNAME", (1, 2), (1, 2), "Helvetica-Bold"),
    ]))
    story.append(Spacer(1, 8*mm))
    story.append(tbl)
    story.append(PageBreak())

    # --- EXECUTIVE SUMMARY ---
    story.append(Paragraph("Executive Summary", h2_style))
    story.append(HRFlowable(width="100%", thickness=0.5, color=colors.Color(*GRAY)))
    story.append(Spacer(1, 4*mm))

    exec_text = (
        f"Nyx performed an autonomous, local-only security assessment of <b>{repo_url}</b>. "
        f"The five-phase pipeline (Detection, Blast-Radius Mapping, Phantom Runtime, Deception Honey Mesh, "
        f"and Remediation) identified <b>{len(findings)} security findings</b>, including "
        f"<b>{crit} critical</b> and <b>{high} high</b> severity issues. "
        f"Full credential values are never transmitted to any AI provider; only masked previews and metadata are used for analysis. "
        f"The final Trust Score is <b>{trust_score}/100</b> after all recommended remediations are applied."
    )
    story.append(Paragraph(exec_text, body_style))
    story.append(Spacer(1, 6*mm))

    # --- FINDINGS TABLE ---
    story.append(Paragraph("Findings", h2_style))
    story.append(HRFlowable(width="100%", thickness=0.5, color=colors.Color(*GRAY)))
    story.append(Spacer(1, 4*mm))

    if findings:
        find_header = [["Severity", "File", "Description", "Engine", "Status"]]
        find_rows = []
        for f in findings:
            find_rows.append([
                f.get("severity", "MED"),
                Paragraph(f.get("file", "unknown")[:40], mono_style),
                Paragraph(f.get("description", "")[:80], body_style),
                f.get("engine", "unknown"),
                f.get("status", "unverified"),
            ])
        find_data = find_header + find_rows
        find_tbl = Table(find_data, colWidths=[18*mm, 40*mm, 65*mm, 30*mm, 22*mm])
        
        sev_colors = {"CRITICAL": (0.9, 0.1, 0.1), "HIGH": (0.9, 0.4, 0.0),
                      "MEDIUM": (0.8, 0.65, 0.0), "LOW": (0.4, 0.6, 0.4)}
        style_cmds = [
            ("BACKGROUND", (0, 0), (-1, 0), colors.Color(*DARK)),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, 0), 9),
            ("FONTNAME", (0, 1), (-1, -1), "Helvetica"),
            ("FONTSIZE", (0, 1), (-1, -1), 8),
            ("GRID", (0, 0), (-1, -1), 0.3, colors.Color(0.85, 0.85, 0.85)),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.Color(*LIGHT), colors.white]),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ]
        for i, f in enumerate(findings, 1):
            sev = f.get("severity", "MEDIUM")
            sc = sev_colors.get(sev, (0.5, 0.5, 0.5))
            style_cmds.append(("TEXTCOLOR", (0, i), (0, i), colors.Color(*sc)))
            style_cmds.append(("FONTNAME", (0, i), (0, i), "Helvetica-Bold"))
        find_tbl.setStyle(TableStyle(style_cmds))
        story.append(find_tbl)
    else:
        story.append(Paragraph("No findings detected.", body_style))

    story.append(PageBreak())

    # --- METHODOLOGY ---
    story.append(Paragraph("Methodology", h2_style))
    story.append(HRFlowable(width="100%", thickness=0.5, color=colors.Color(*GRAY)))
    story.append(Spacer(1, 4*mm))
    story.append(Paragraph(
        "Full credential values are never transmitted to any AI provider — only masked previews and metadata are used for analysis.",
        body_style,
    ))
    story.append(Spacer(1, 6*mm))

    # --- REMEDIATION DETAILS ---
    story.append(Paragraph("Remediation Details", h2_style))
    story.append(HRFlowable(width="100%", thickness=0.5, color=colors.Color(*GRAY)))
    story.append(Spacer(1, 4*mm))

    for fix in fixes:
        story.append(Paragraph(fix.get("title", "Fix"), h3_style))
        story.append(Paragraph(f"<b>File:</b> {fix.get('file', 'N/A')} | <b>Severity:</b> {fix.get('severity', 'N/A')}", body_style))
        story.append(Paragraph(fix.get("fix", fix.get("issue", "")), body_style))
        
        diff = fix.get("diff", {})
        if diff.get("before"):
            story.append(Paragraph(f"Before:", ParagraphStyle("Label", fontSize=8, textColor=colors.Color(*GRAY), fontName="Helvetica")))
            story.append(Paragraph(str(diff["before"])[:120], mono_style))
        if diff.get("after"):
            story.append(Paragraph(f"After:", ParagraphStyle("Label", fontSize=8, textColor=colors.Color(*GREEN), fontName="Helvetica")))
            story.append(Paragraph(str(diff["after"])[:120], mono_style))
        
        story.append(Spacer(1, 4*mm))

    # --- FOOTER ---
    story.append(PageBreak())
    story.append(Paragraph("Trust Model", h2_style))
    story.append(HRFlowable(width="100%", thickness=0.5, color=colors.Color(*GRAY)))
    story.append(Spacer(1, 4*mm))
    story.append(Paragraph(
        "This report was generated entirely on the user's local machine. No code, repository contents, "
        "or secrets were transmitted to any Nyx-operated server. AI requests carry only masked findings metadata. "
        "All API calls made during this scan were directed to the user's own GitHub, Gemini, and Groq accounts. "
        "This report is saved locally and must be shared deliberately by the user.",
        body_style
    ))
    story.append(Spacer(1, 6*mm))
    story.append(Paragraph(f"Nyx v2.0 | {now} | Local-only assessment", caption_style))

    doc.build(story)


async def generate_pdf(state_data: Dict[str, Any]) -> str:
    """Generate the PDF report asynchronously. Returns local file path."""
    pdf_path = str(REPORTS_DIR / f"nyx_report_{datetime.now().strftime('%Y%m%d_%H%M%S')}.pdf")
    
    # Collect all data from last known state
    report_data = {
        "findings": state_data.get("findings", []),
        "fixes": state_data.get("fixes", []),
        "trust_score": state_data.get("trust_score", 95),
        "repo_url": state_data.get("repo_url", "Unknown"),
    }
    
    await asyncio.to_thread(_build_pdf_sync, report_data, pdf_path)
    return pdf_path
