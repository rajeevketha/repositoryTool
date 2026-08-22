#!/usr/bin/env python3
"""OrgFlow management briefing — 16:9 PowerPoint for Google Slides import."""

from pptx import Presentation
from pptx.dml.color import RGBColor
from pptx.enum.shapes import MSO_SHAPE
from pptx.enum.text import MSO_ANCHOR, PP_ALIGN
from pptx.oxml.ns import nsmap, qn
from pptx.util import Emu, Inches, Pt
from lxml import etree

NAVY = RGBColor(0x1B, 0x36, 0x5D)
NAVY2 = RGBColor(0x0F, 0x23, 0x40)
INK = RGBColor(0x1A, 0x1D, 0x23)
BODY = RGBColor(0x3D, 0x44, 0x50)
MUTED = RGBColor(0x6B, 0x72, 0x80)
LINE = RGBColor(0xD8, 0xDE, 0xE6)
PAPER = RGBColor(0xFF, 0xFF, 0xFF)
WASH = RGBColor(0xF4, 0xF6, 0xF9)
ACCENT = RGBColor(0x8A, 0x73, 0x48)
WHITE = RGBColor(0xFF, 0xFF, 0xFF)
GOLD = RGBColor(0xD4, 0xC4, 0xA0)

W = Inches(13.333)
H = Inches(7.5)
FONT = "Calibri"


def fill(shape, color):
    shape.fill.solid()
    shape.fill.fore_color.rgb = color


def no_line(shape):
    shape.line.fill.background()


def rect(slide, l, t, w, h, color):
    sh = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, l, t, w, h)
    fill(sh, color)
    no_line(sh)
    return sh


def txt(slide, l, t, w, h, text, size=18, color=INK, bold=False):
    box = slide.shapes.add_textbox(l, t, w, h)
    tf = box.text_frame
    tf.word_wrap = True
    p = tf.paragraphs[0]
    run = p.add_run()
    run.text = text
    run.font.size = Pt(size)
    run.font.color.rgb = color
    run.font.bold = bold
    run.font.name = FONT
    return tf


def add_run(p, text, size, color, bold=False):
    run = p.add_run()
    run.text = text
    run.font.size = Pt(size)
    run.font.color.rgb = color
    run.font.bold = bold
    run.font.name = FONT
    return run


def footer(slide, page, total, dark=False):
    rect(slide, 0, Inches(7.15), W, Inches(0.35), NAVY2 if dark else PAPER)
    if not dark:
        rect(slide, 0, Inches(7.15), W, Emu(12700), LINE)
    left = "OrgFlow  ·  Internal use"
    right = f"{page}  /  {total}"
    txt(slide, Inches(0.7), Inches(7.18), Inches(7), Inches(0.28), left, 11, GOLD if dark else MUTED)
    box = slide.shapes.add_textbox(Inches(10.2), Inches(7.18), Inches(2.4), Inches(0.28))
    p = box.text_frame.paragraphs[0]
    p.alignment = PP_ALIGN.RIGHT
    add_run(p, right, 11, GOLD if dark else MUTED)


def eyebrow(slide, text):
    txt(slide, Inches(0.7), Inches(0.38), Inches(12), Inches(0.28), text.upper(), 11, ACCENT, True)


def heading(slide, text, size=26):
    txt(slide, Inches(0.7), Inches(0.68), Inches(12), Inches(0.9), text, size, NAVY, True)


def panel(slide, l, t, w, h, title, body):
    rect(slide, l, t, w, Inches(0.06), NAVY)
    rect(slide, l, t + Inches(0.06), w, h - Inches(0.06), WASH)
    tf = txt(slide, l + Inches(0.16), t + Inches(0.16), w - Inches(0.32), Inches(0.36), title, 14, NAVY, True)
    box = slide.shapes.add_textbox(l + Inches(0.16), t + Inches(0.52), w - Inches(0.32), h - Inches(0.68))
    tf = box.text_frame
    tf.word_wrap = True
    first = True
    for line in body.split("\n"):
        p = tf.paragraphs[0] if first else tf.add_paragraph()
        first = False
        p.space_after = Pt(6)
        add_run(p, line, 13, BODY)


def bullets(slide, l, t, w, h, items, size=16):
    box = slide.shapes.add_textbox(l, t, w, h)
    tf = box.text_frame
    tf.word_wrap = True
    for i, item in enumerate(items):
        p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        p.level = 0
        p.space_after = Pt(8)
        add_run(p, item, size, BODY)
    return tf


def style_table(table, header=True):
    for row_idx, row in enumerate(table.rows):
        for cell in row.cells:
            cell.margin_left = Inches(0.08)
            cell.margin_right = Inches(0.08)
            cell.margin_top = Inches(0.06)
            cell.margin_bottom = Inches(0.06)
            fill_color = NAVY if row_idx == 0 and header else (WASH if row_idx % 2 == 0 else PAPER)
            cell.fill.solid()
            cell.fill.fore_color.rgb = fill_color
            for p in cell.text_frame.paragraphs:
                for run in p.runs:
                    run.font.name = FONT
                    run.font.size = Pt(11 if row_idx else 10)
                    run.font.bold = row_idx == 0 or cell == row.cells[0]
                    run.font.color.rgb = WHITE if row_idx == 0 and header else (NAVY if cell == row.cells[0] else BODY)


def build():
    prs = Presentation()
    prs.slide_width = W
    prs.slide_height = H
    blank = prs.slide_layouts[6]
    total = 11

    # 1 Title
    s = prs.slides.add_slide(blank)
    rect(s, 0, 0, W, H, NAVY)
    txt(s, Inches(0.7), Inches(3.15), Inches(11), Inches(0.3), "INTERNAL BRIEFING", 12, GOLD, True)
    rect(s, Inches(0.7), Inches(3.52), Inches(0.55), Inches(0.04), GOLD)
    txt(s, Inches(0.7), Inches(3.7), Inches(11.5), Inches(0.8), "OrgFlow", 40, WHITE, True)
    txt(
        s,
        Inches(0.7),
        Inches(4.55),
        Inches(11.2),
        Inches(1.5),
        "A lightweight way for Salesforce administrators to promote configuration between environments—without a developer workstation or a release-management platform.",
        18,
        RGBColor(0xD7, 0xDD, 0xE6),
    )
    footer(s, 1, total, dark=True)

    # 2 Agenda
    s = prs.slides.add_slide(blank)
    rect(s, 0, 0, W, H, PAPER)
    eyebrow(s, "Contents")
    heading(s, "Agenda")
    items = [
        ("01", "Context and the recommendation"),
        ("02", "Intended users and operating model"),
        ("03", "Comparison with tools already in use"),
        ("04", "Scope, governance, and a proposed pilot"),
    ]
    top = Inches(1.85)
    for num, label in items:
        rect(s, Inches(0.7), top + Inches(0.62), Inches(11.8), Emu(12700), LINE)
        txt(s, Inches(0.7), top, Inches(0.7), Inches(0.5), num, 20, ACCENT, True)
        txt(s, Inches(1.55), top, Inches(10.5), Inches(0.5), label, 20, INK)
        top += Inches(0.78)
    footer(s, 2, total)

    # 3 Context
    s = prs.slides.add_slide(blank)
    rect(s, 0, 0, W, H, PAPER)
    eyebrow(s, "Context")
    heading(s, "Small configuration changes still consume disproportionate time", 22)
    txt(
        s,
        Inches(0.7),
        Inches(1.55),
        Inches(12),
        Inches(0.7),
        "Administrators typically complete a field, layout, or flow in a sandbox in well under an hour. Moving that work to QA or production often takes much longer than building it.",
        16,
        INK,
    )
    panel(s, Inches(0.7), Inches(2.45), Inches(3.85), Inches(4.0), "Handoffs", "Promotion frequently waits on someone fluent in VS Code, change sets, or a release tool. The delay is process, not complexity.")
    panel(s, Inches(4.75), Inches(2.45), Inches(3.85), Inches(4.0), "Fragmented tooling", "Workbench, the Salesforce CLI, and enterprise DevOps platforms each solve a different job. None is designed for a short, named configuration move.")
    panel(s, Inches(8.8), Inches(2.45), Inches(3.85), Inches(4.0), "Inconsistent packages", "Rebuilding the component list in each environment increases the chance that QA and production do not receive the same change.")
    footer(s, 3, total)

    # 4 Recommendation
    s = prs.slides.add_slide(blank)
    rect(s, 0, 0, W, H, PAPER)
    eyebrow(s, "Recommendation")
    heading(s, "Adopt OrgFlow for administrator-led promotions", 24)
    txt(
        s,
        Inches(0.7),
        Inches(1.55),
        Inches(12),
        Inches(0.75),
        "OrgFlow is a Chrome extension. Staff select the configuration they built, retrieve a snapshot from the source organization, and deploy that same snapshot to the target organization.",
        16,
        INK,
    )
    panel(
        s,
        Inches(0.7),
        Inches(2.5),
        Inches(5.85),
        Inches(4.0),
        "What this provides",
        "A guided source-to-target path in the existing browser.\nNo Salesforce CLI, DX project, or Connected App.\nOptional team repository later; not required to start.\nNo incremental platform license to evaluate first.",
    )
    panel(
        s,
        Inches(6.8),
        Inches(2.5),
        Inches(5.85),
        Inches(4.0),
        "What this is not",
        "Not a replacement for VS Code or engineering CI.\nNot a substitute for Copado, Gearset, or Flosum.\nNot a data-migration or full-org compare product.\nNot an automated dependency analyzer.",
    )
    footer(s, 4, total)

    # 5 Fit
    s = prs.slides.add_slide(blank)
    rect(s, 0, 0, W, H, PAPER)
    eyebrow(s, "Fit")
    heading(s, "Intended users")
    panel(
        s,
        Inches(0.7),
        Inches(1.85),
        Inches(5.85),
        Inches(4.65),
        "Appropriate",
        "Salesforce administrators and configurators working primarily in Setup.\nPromotions of a defined set of named metadata (fields, layouts, flows, permission sets).\nTeams that want a shared history later, not as a prerequisite.\nA time-boxed pilot before any platform discussion.",
    )
    panel(
        s,
        Inches(6.8),
        Inches(1.85),
        Inches(5.85),
        Inches(4.65),
        "Not appropriate",
        "Apex, Lightning Web Components, and continuous integration.\nMulti-stream release trains and formal environment governance programs.\nRecord or data movement between organizations.\nDiscovery of unknown dependencies across an entire org.",
    )
    footer(s, 5, total)

    # 6 Operating model
    s = prs.slides.add_slide(blank)
    rect(s, 0, 0, W, H, PAPER)
    eyebrow(s, "Operating model")
    heading(s, "Four sequential steps; later steps stay closed until the prior one is complete", 20)
    panel(s, Inches(0.55), Inches(1.9), Inches(2.95), Inches(4.55), "1. Start", "Sign in to the source and target Salesforce organizations in Chrome. Detect sessions. Select From and To. The two organizations must be different.")
    panel(s, Inches(3.65), Inches(1.9), Inches(2.95), Inches(4.55), "2. Package", "Review recent changes in the source organization and select the components to move. OrgFlow assembles the package; staff do not author XML.")
    panel(s, Inches(6.75), Inches(1.9), Inches(2.95), Inches(4.55), "3. Retrieve", "Retrieve a snapshot from the source. Jira is optional when storing on the device, and required if a shared repository is enabled.")
    panel(s, Inches(9.85), Inches(1.9), Inches(2.95), Inches(4.55), "4. Confirm", "Review the path and contents. Run a validation (dry run) if required. Deploy. The same snapshot can be promoted to the next environment.")
    footer(s, 6, total)

    # 7 Comparison table
    s = prs.slides.add_slide(blank)
    rect(s, 0, 0, W, H, PAPER)
    eyebrow(s, "Comparison")
    heading(s, "Positioning against tools already in the stack", 22)
    table = s.shapes.add_table(5, 4, Inches(0.55), Inches(1.85), Inches(12.2), Inches(4.7)).table
    headers = ["", "Workbench", "VS Code and Salesforce CLI", "OrgFlow"]
    rows = [
        ["Primary job", "API console for a prepared retrieve or deploy zip", "Source-driven development and CI", "Administrator-led promotion of named configuration"],
        ["Skill required", "Metadata API and package.xml", "DX project, authorize, retrieve, deploy", "Salesforce Setup and a Chrome sign-in"],
        ["Repeatability", "Each organization is a new session", "Repository is the system of record", "One snapshot can move source → QA → production"],
        ["Oversight", "No enforced source and target pair", "Governed by branch and pipeline policy", "Source and target must differ; confirmation precedes deploy"],
    ]
    table.columns[0].width = Inches(2.0)
    for i in range(1, 4):
        table.columns[i].width = Inches(3.4)
    for c, h in enumerate(headers):
        table.cell(0, c).text = h
    for r, row in enumerate(rows, 1):
        for c, val in enumerate(row):
            table.cell(r, c).text = val
    style_table(table)
    footer(s, 7, total)

    # 8 Other tools
    s = prs.slides.add_slide(blank)
    rect(s, 0, 0, W, H, PAPER)
    eyebrow(s, "Comparison")
    heading(s, "Change sets and enterprise DevOps platforms", 22)
    panel(s, Inches(0.7), Inches(1.8), Inches(5.85), Inches(2.35), "Change sets", "Effective for occasional, well-known components. Slow to assemble, easy to omit a related item, and inconvenient to reuse. OrgFlow keeps a single named list and a single snapshot.")
    panel(s, Inches(6.8), Inches(1.8), Inches(5.85), Inches(2.35), "Copado, Gearset, Flosum", "Appropriate for multi-team release trains, compliance, and broad org comparison. Disproportionate for a two-item configuration move. OrgFlow is intended to sit beside those platforms.")
    panel(s, Inches(0.7), Inches(4.35), Inches(5.85), Inches(2.2), "Repository-only process", "A Git repository without a selection interface still requires a developer. OrgFlow can write versioned snapshots to GitHub, GitLab, or Azure DevOps after components are selected.")
    panel(s, Inches(6.8), Inches(4.35), Inches(5.85), Inches(2.2), "Deliberate limits", "OrgFlow does not migrate records, compare entire organizations, or infer dependencies. Staff promote what they selected. That constraint is a control.")
    footer(s, 8, total)

    # 9 Governance
    s = prs.slides.add_slide(blank)
    rect(s, 0, 0, W, H, PAPER)
    eyebrow(s, "Governance")
    heading(s, "Access, blast radius, and audit")
    panel(s, Inches(0.7), Inches(1.85), Inches(3.85), Inches(4.65), "Access", "Uses the Salesforce session already present in Chrome. No Connected App. Optional Git credentials remain in that browser profile and are not written to the repository.")
    panel(s, Inches(4.75), Inches(1.85), Inches(3.85), Inches(4.65), "Blast radius", "Only named metadata is deployed. Source and target cannot be the same organization. Validation is available as a dry run. Apex tests may be executed in production if policy requires coverage.")
    panel(s, Inches(8.8), Inches(1.85), Inches(3.85), Inches(4.65), "Audit", "Device storage: local snapshots; Jira optional. Shared repository: Jira key and comment required; versions reside in the team warehouse under a known folder structure.")
    footer(s, 9, total)

    # 10 Pilot
    s = prs.slides.add_slide(blank)
    rect(s, 0, 0, W, H, PAPER)
    eyebrow(s, "Proposal")
    heading(s, "A two-week pilot")
    panel(
        s,
        Inches(0.7),
        Inches(1.85),
        Inches(5.85),
        Inches(4.65),
        "Scope",
        "Two administrators; two sandbox or disposable organizations.\nOne representative change (for example a field and layout, or a flow).\nPromote source → QA using device storage.\nOptional: connect a test repository in the second week.",
    )
    panel(
        s,
        Inches(6.8),
        Inches(1.85),
        Inches(5.85),
        Inches(4.65),
        "Success criteria",
        "A complete promotion without developer assistance.\nThe target organization receives the selected components.\nNo new platform license required to complete the pilot.\nA clear decision on whether a shared repository is needed.",
    )
    footer(s, 10, total)

    # 11 Decision
    s = prs.slides.add_slide(blank)
    rect(s, 0, 0, W, H, PAPER)
    eyebrow(s, "Decision")
    heading(s, "Requested action", 28)
    txt(
        s,
        Inches(0.7),
        Inches(1.7),
        Inches(12),
        Inches(1.0),
        "Approve a two-week pilot with two administrators. Defer any discussion of replacing existing DevOps tooling until that pilot has a written outcome.",
        18,
        INK,
    )
    panel(s, Inches(0.7), Inches(3.0), Inches(5.85), Inches(3.45), "Distribution", "Chrome Web Store listing, or load the unpacked extension from the internal zip. Two signed-in Salesforce organizations are required. Source and target must be different.")
    panel(s, Inches(6.8), Inches(3.0), Inches(5.85), Inches(3.45), "Listing", "https://chromewebstore.google.com/detail/orgflow/cldfmnjjonlakccebbfnaaihneonhflc")
    footer(s, 11, total)

    out = "/workspace/docs/orgflow-manager-briefing.pptx"
    prs.save(out)
    print(out)


if __name__ == "__main__":
    build()
