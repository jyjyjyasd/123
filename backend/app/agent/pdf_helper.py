# app/agent/pdf_helper.py
import logging
import fitz

logger = logging.getLogger("posterforge.agent.pdf_helper")

def extract_text_from_pdf(pdf_data: bytes) -> str:
    """从 PDF 二进制数据中提取纯文本。"""
    try:
        doc = fitz.open(stream=pdf_data, filetype="pdf")
        text_list = []
        for page in doc:
            text_list.append(page.get_text())
        doc.close()
        return "\n".join(text_list).strip()
    except Exception as e:
        logger.error("extract_text_from_pdf failed: %s", e)
        raise ValueError(f"PDF 文本提取失败: {str(e)}")

def render_pdf_page_to_image(pdf_data: bytes, page_index: int = 0) -> bytes:
    """将 PDF 的指定页渲染为 PNG 图片二进制字节。"""
    try:
        doc = fitz.open(stream=pdf_data, filetype="pdf")
        if len(doc) <= page_index:
            raise ValueError(f"PDF 页面索引 {page_index} 超出范围 (总页数: {len(doc)})")
        page = doc.load_page(page_index)
        # 渲染为 pixmap，DPI 设为 150 保证清晰度
        pix = page.get_pixmap(dpi=150)
        png_bytes = pix.tobytes(format="png")
        doc.close()
        return png_bytes
    except Exception as e:
        logger.error("render_pdf_page_to_image failed: %s", e)
        raise ValueError(f"PDF 页面图像渲染失败: {str(e)}")
