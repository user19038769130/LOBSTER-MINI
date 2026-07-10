const path = require('path');
const fs = require('fs');
const PptxGenJS = require('pptxgenjs');
const sizeOf = require('image-size');

async function generatePpt(planFile, slideImages, outputFile) {
  const planRaw = fs.readFileSync(planFile, 'utf-8');
  const plan = JSON.parse(planRaw);

  const aspectRatio = plan.aspect_ratio || '16:9';
  let slideWidth, slideHeight;
  if (aspectRatio === '16:9') {
    slideWidth = 13.333;
    slideHeight = 7.5;
  } else if (aspectRatio === '4:3') {
    slideWidth = 10;
    slideHeight = 7.5;
  } else {
    slideWidth = 13.333;
    slideHeight = 7.5;
  }

  const pptx = new PptxGenJS();
  pptx.defineLayout({ name: 'CUSTOM', width: slideWidth, height: slideHeight });
  pptx.layout = 'CUSTOM';

  const slidesInfo = plan.slides || [];

  for (let i = 0; i < slideImages.length; i++) {
    const imgPath = slideImages[i];
    if (!fs.existsSync(imgPath)) {
      throw new Error(`幻灯片图片不存在: ${imgPath}`);
    }

    const dimensions = sizeOf(imgPath);
    const imgW = dimensions.width;
    const imgH = dimensions.height;
    if (!imgW || !imgH) {
      throw new Error(`无法获取图片尺寸: ${imgPath}`);
    }

    const slideWpx = slideWidth * 96;
    const slideHpx = slideHeight * 96;
    const imgAspect = imgW / imgH;
    const slideAspect = slideWpx / slideHpx;

    let drawW, drawH;
    if (imgAspect > slideAspect) {
      drawH = slideHpx;
      drawW = slideHpx * imgAspect;
    } else {
      drawW = slideWpx;
      drawH = slideWpx / imgAspect;
    }

    const x = (slideWpx - drawW) / 2 / 96;
    const y = (slideHpx - drawH) / 2 / 96;
    const w = drawW / 96;
    const h = drawH / 96;

    const slide = pptx.addSlide();
    slide.addImage({ path: imgPath, x, y, w, h });

    const info = slidesInfo[i] || {};
    const notes = [];
    if (info.title) notes.push(`Title: ${info.title}`);
    if (info.subtitle) notes.push(`Subtitle: ${info.subtitle}`);
    if (info.key_points) {
      notes.push('Key Points:');
      info.key_points.forEach(p => notes.push(`  • ${p}`));
    }
    if (notes.length > 0) {
      slide.addNotes(notes.join('\n'));
    }
  }

  await pptx.writeFile({ fileName: outputFile });
  return `成功生成演示文稿，包含 ${slideImages.length} 张幻灯片 -> ${outputFile}`;
}

module.exports = { generatePpt };