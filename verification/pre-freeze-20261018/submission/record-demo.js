async page => {
  const base = 'http://124.70.96.183:6780';
  const steps = [];
  const pause = ms => page.waitForTimeout(ms);
  const chapter = async (title, description) => {
    steps.push({title, at: new Date().toISOString()});
    await page.screencast.showChapter(title, {description, duration:2200});
  };
  await page.goto(base + '/dashboard',{waitUntil:'domcontentloaded',timeout:60000});
  await page.getByRole('heading', {name:'穿出好心情。',exact:true}).waitFor();
  await page.screencast.start({path:'verification/submission/dada-demo.webm',size:{width:1440,height:1000}});
  try {
    await chapter('搭搭 · AI 衣橱与穿搭助手', '云上码术｜公网实际操作｜合成衣物演示账号');
    await pause(2500);
    await page.getByRole('link',{name:'我的衣橱',exact:true}).first().click();
    await page.getByRole('button',{name:'蓝色衬衫（演示样例）',exact:true}).waitFor();
    await chapter('01 管好已有衣物', '照片、类别和颜色集中管理；本次使用合成样例');
    await page.getByRole('button',{name:'蓝色衬衫（演示样例）',exact:true}).click();
    await page.getByRole('dialog').waitFor();
    await pause(3500);
    await page.keyboard.press('Escape');
    await page.goto(base + '/dashboard/suggest',{waitUntil:'domcontentloaded',timeout:60000});
    await page.getByRole('button',{name:'获取推荐',exact:true}).waitFor();
    await chapter('02 用真实衣橱生成搭配', '选择办公场合，提交一套推荐；云端模型实际生成');
    await page.getByRole('button',{name:'办公',exact:true}).click();
    await page.getByRole('button',{name:'专注一套',exact:true}).click();
    await page.getByRole('button',{name:'获取推荐',exact:true}).click();
    await page.getByRole('heading',{name:/套穿搭方案/}).waitFor({timeout:90000});
    await page.getByRole('heading',{name:/套穿搭方案/}).scrollIntoViewIfNeeded();
    await pause(4500);
    await page.screenshot({path:'verification/submission/recommendation-public.png'});
    await page.goto(base + '/dashboard/looks',{waitUntil:'domcontentloaded',timeout:60000});
    await page.getByRole('main').waitFor();
    await pause(2500);
    await chapter('03 从风格灵感到衣橱练习', '浏览原创虚构人物示范，探索不同搭配方向');
    await page.getByRole('main').evaluate(el => window.scrollBy(0,300));
    await pause(3500);
    await page.goto(base + '/dashboard/wardrobe/avatar',{waitUntil:'domcontentloaded',timeout:60000});
    await page.getByRole('button',{name:/导出造型图/}).waitFor();
    await page.waitForFunction(() => Array.from(document.querySelectorAll('button')).some(b=>b.textContent.includes('导出造型图') && !b.disabled),{timeout:45000});
    await chapter('04 预设三维造型与视角', '这是预设数字人物，不是本人照片三维重建');
    await page.getByRole('button',{name:'侧面',exact:true}).click();
    await pause(2500);
    await page.getByRole('button',{name:'正面',exact:true}).click();
    await pause(2500);
    await page.screenshot({path:'verification/submission/avatar-video.png'});
    await chapter('源码与交付版本可追溯', '公开仓库 AIdol｜开源基础与团队新增详见 README｜维护至11月10日');
    return {steps,finished:true,url:page.url()};
  } finally {
    await page.screencast.stop();
  }
}
