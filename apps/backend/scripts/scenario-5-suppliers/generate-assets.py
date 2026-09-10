#!/usr/bin/env python3
"""
Генератор файлов для сценария "1 заказчик -> 5 поставщиков одного товара".

Создаёт в ./assets:
  - buyer-request-profnastil.pdf         — спецификация закупки (её прикладывает заказчик к заявке)
  - supplier-<key>-photo.png             — фото товара поставщика (разное у каждого)
  - supplier-<key>-spec.pdf              — карточка/прайс товара поставщика (разное описание)

Товар у всех один: «Профнастил С8». Отличаются цвет, толщина, покрытие, цена, фото.

Запуск:  python generate-assets.py
Требует: Pillow, fpdf2  (обе уже стоят в системе)
"""
from __future__ import annotations
import os
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
from fpdf import FPDF

HERE = Path(__file__).resolve().parent
OUT = HERE / "assets"
OUT.mkdir(exist_ok=True)

FONT_REG = "C:/Windows/Fonts/arial.ttf"
FONT_BOLD = "C:/Windows/Fonts/arialbd.ttf"

# --- общий товар ---------------------------------------------------------------
PRODUCT_NAME = "Профнастил С8"
PRODUCT_KEYWORDS = "профнастил С8 оцинкованный кровля профлист стеновой"

# --- 5 поставщиков: один товар, разные характеристики/фото/описание -----------
SUPPLIERS = [
    dict(
        key="stroymetall",
        company="СтройМеталл Алматы",
        person="Арман Досжанов",
        city="Алматы",
        color="RAL 9003 сигнально-белый",
        rgb=(226, 228, 232),
        stripe=(198, 202, 210),
        thickness="0.45 мм",
        coating="полиэстер глянцевый",
        price_per_sheet=2900,
        note="Профлист со склада в Алматы, есть остатки под быструю отгрузку.",
    ),
    dict(
        key="krovlyapro",
        company="КровляПро KZ",
        person="Динара Ныгметова",
        city="Алматы",
        color="оцинкованный, без покрытия",
        rgb=(196, 201, 206),
        stripe=(170, 176, 182),
        thickness="0.50 мм",
        coating="цинк Zn140",
        price_per_sheet=2400,
        note="Голый оцинкованный профнастил С8 для кровли и заборов. Режем в размер.",
    ),
    dict(
        key="metallprofil",
        company="МеталлПрофиль Астана-Юг",
        person="Ерлан Сапаров",
        city="Алматы",
        color="RAL 8017 шоколадно-коричневый",
        rgb=(92, 62, 46),
        stripe=(72, 47, 34),
        thickness="0.50 мм",
        coating="полиэстер матовый",
        price_per_sheet=3150,
        note="Профнастил С8 с матовым покрытием, гарантия на цинк 10 лет.",
    ),
    dict(
        key="grandsteel",
        company="Grand Steel",
        person="Тимур Ахметов",
        city="Алматы",
        color="RAL 6005 зелёный мох",
        rgb=(42, 82, 52),
        stripe=(30, 64, 40),
        thickness="0.40 мм",
        coating="полиэстер",
        price_per_sheet=2750,
        note="Эконом-профлист С8, толщина 0.40 мм. Подходит для навесов и кровли склада.",
    ),
    dict(
        key="aktorgmetall",
        company="АкТоргМеталл",
        person="Сауле Ким",
        city="Алматы",
        color="RAL 5005 сигнально-синий",
        rgb=(32, 58, 122),
        stripe=(24, 44, 96),
        thickness="0.55 мм",
        coating="полиэстер",
        price_per_sheet=3400,
        note="Усиленный профнастил С8 0.55 мм, длина листа до 6 м под заказ.",
    ),
]

# --- заявка заказчика --------------------------------------------------------
BUYER = dict(
    company="ТОО «Астана Логистик Склад»",
    person="Мади Оспанов",
    city="Алматы",
    qty_sheets=800,
    sheet_len="2000 мм",
    need="оцинкованный профнастил С8 для кровли складского ангара",
    deadline="до 30 сентября 2026",
    terms="самовывоз со склада поставщика в Алматы, оплата по счёту (безнал)",
)


def _font(path: str, size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(path, size)


def make_photo(s: dict) -> Path:
    """Фото товара: 900x640, фон цвета профнастила + гофро-полосы + подпись."""
    W, H = 900, 640
    img = Image.new("RGB", (W, H), s["rgb"])
    d = ImageDraw.Draw(img)

    # гофрированные полосы (профиль С8)
    for x in range(0, W, 46):
        d.rectangle([x, 0, x + 22, H], fill=s["stripe"])

    # затемнённая плашка под текст
    d.rectangle([0, H - 168, W, H], fill=(0, 0, 0))
    overlay = Image.new("RGBA", (W, 168), (0, 0, 0, 150))
    img.paste(Image.blend(Image.new("RGB", (W, 168), s["rgb"]), Image.new("RGB", (W, 168), (0, 0, 0)), 0.72), (0, H - 168))

    d = ImageDraw.Draw(img)
    d.text((34, H - 150), s["company"], font=_font(FONT_BOLD, 34), fill=(255, 255, 255))
    d.text((34, H - 104), f"{PRODUCT_NAME} · {s['color']}", font=_font(FONT_REG, 26), fill=(235, 235, 235))
    d.text((34, H - 64), f"толщина {s['thickness']} · {s['coating']} · {s['price_per_sheet']} ₸/лист",
           font=_font(FONT_REG, 22), fill=(215, 215, 215))

    # штамп сверху
    d.text((34, 28), "ФОТО ТОВАРА", font=_font(FONT_BOLD, 22), fill=(255, 255, 255))
    d.text((34, 60), f"С8 · {s['thickness']}", font=_font(FONT_REG, 20), fill=(240, 240, 240))

    p = OUT / f"supplier-{s['key']}-photo.png"
    img.save(p, "PNG")
    return p


class Doc(FPDF):
    def header(self):  # noqa: D401
        pass

    def footer(self):
        self.set_y(-15)
        self.set_font("a", "", 8)
        self.set_text_color(140)
        self.cell(0, 10, "HupHup · тестовый сценарий · сгенерировано автоматически", align="C")


def _new_doc() -> Doc:
    pdf = Doc()
    pdf.add_font("a", "", FONT_REG)
    pdf.add_font("a", "B", FONT_BOLD)
    pdf.set_auto_page_break(True, margin=20)
    pdf.add_page()
    return pdf


def make_supplier_pdf(s: dict) -> Path:
    pdf = _new_doc()
    pdf.set_font("a", "B", 18)
    pdf.cell(0, 12, s["company"], new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("a", "", 10)
    pdf.set_text_color(90)
    pdf.cell(0, 7, f"г. {s['city']} · менеджер {s['person']} · +7 (700) 000-00-00", new_x="LMARGIN", new_y="NEXT")
    pdf.set_text_color(0)
    pdf.ln(6)

    pdf.set_font("a", "B", 14)
    pdf.cell(0, 10, f"Коммерческое предложение: {PRODUCT_NAME}", new_x="LMARGIN", new_y="NEXT")
    pdf.ln(2)
    pdf.set_font("a", "", 11)
    pdf.multi_cell(0, 6, s["note"])
    pdf.ln(3)

    rows = [
        ("Товар", f"{PRODUCT_NAME} (профилированный лист стеновой)"),
        ("Цвет / покрытие", f"{s['color']} · {s['coating']}"),
        ("Толщина стали", s["thickness"]),
        ("Ширина полезная", "1150 мм"),
        ("Длина листа", "по заказу, 0.5–6.0 м"),
        ("Оцинковка", "горячее цинкование, ГОСТ Р 52146"),
        ("Цена", f"{s['price_per_sheet']} ₸ за лист 2.0 м (с НДС)"),
        ("Наличие", "на складе в г. Алматы"),
        ("Отгрузка", "самовывоз или доставка по городу"),
    ]
    pdf.set_font("a", "", 11)
    for k, v in rows:
        pdf.set_font("a", "B", 11)
        pdf.cell(52, 8, k, border=1)
        pdf.set_font("a", "", 11)
        pdf.multi_cell(0, 8, v, border=1, new_x="LMARGIN", new_y="NEXT")

    pdf.ln(6)
    pdf.set_font("a", "", 10)
    pdf.set_text_color(90)
    pdf.multi_cell(0, 5, "Ключевые слова для подбора: " + PRODUCT_KEYWORDS + " " + s["color"])

    p = OUT / f"supplier-{s['key']}-spec.pdf"
    pdf.output(str(p))
    return p


def make_buyer_pdf() -> Path:
    pdf = _new_doc()
    pdf.set_font("a", "B", 18)
    pdf.cell(0, 12, "Спецификация закупки", new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("a", "", 10)
    pdf.set_text_color(90)
    pdf.cell(0, 7, f"{BUYER['company']} · г. {BUYER['city']} · {BUYER['person']}", new_x="LMARGIN", new_y="NEXT")
    pdf.set_text_color(0)
    pdf.ln(6)

    pdf.set_font("a", "B", 14)
    pdf.cell(0, 10, f"Требуется: {PRODUCT_NAME}", new_x="LMARGIN", new_y="NEXT")
    pdf.ln(2)
    pdf.set_font("a", "", 11)
    pdf.multi_cell(0, 6, f"Нужен {BUYER['need']}. Профнастил С8 оцинкованный, "
                         f"стеновой профилированный лист. Рассматриваем предложения "
                         f"от поставщиков г. Алматы.")
    pdf.ln(3)

    rows = [
        ("Товар", f"{PRODUCT_NAME}, оцинкованный"),
        ("Количество", f"{BUYER['qty_sheets']} листов"),
        ("Длина листа", BUYER["sheet_len"]),
        ("Толщина стали", "0.45–0.55 мм"),
        ("Назначение", "кровля складского ангара"),
        ("Город поставки", BUYER["city"]),
        ("Условия", BUYER["terms"]),
        ("Срок", BUYER["deadline"]),
    ]
    for k, v in rows:
        pdf.set_font("a", "B", 11)
        pdf.cell(52, 8, k, border=1)
        pdf.set_font("a", "", 11)
        pdf.multi_cell(0, 8, v, border=1, new_x="LMARGIN", new_y="NEXT")

    pdf.ln(6)
    pdf.set_font("a", "", 10)
    pdf.set_text_color(90)
    pdf.multi_cell(0, 5, "Ключевые слова: " + PRODUCT_KEYWORDS + " кровля склад ангар Алматы самовывоз")

    p = OUT / "buyer-request-profnastil.pdf"
    pdf.output(str(p))
    return p


def main() -> None:
    made = []
    made.append(make_buyer_pdf())
    for s in SUPPLIERS:
        made.append(make_photo(s))
        made.append(make_supplier_pdf(s))
    print(f"Сгенерировано {len(made)} файлов в {OUT}:")
    for p in made:
        print(f"  {p.name}  ({p.stat().st_size} B)")


if __name__ == "__main__":
    main()
