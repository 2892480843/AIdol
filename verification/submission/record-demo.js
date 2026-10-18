async page => {
  const base = 'https://124.70.96.183:6780';
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
    await page.getByRole('heading',{name:'推荐进度',exact:true}).waitFor();
    await chapter('02 恢复真实生成的推荐', '刚完成的云端办公搭配已保存，刷新后仍可查看');
    if (!(await page.getByRole('button',{name:'喜欢',exact:true}).isVisible())) {
      await page.getByRole('button',{name:/办公.*已完成.*查看/}).click();
    }
    await page.getByRole('button',{name:'喜欢',exact:true}).waitFor({timeout:30000});
    await page.getByRole('button',{name:'喜欢',exact:true}).scrollIntoViewIfNeeded();
    await pause(4500);
    await page.screenshot({path:'verification/submission/recommendation-public.png'});
    await page.goto(base + '/dashboard/looks',{waitUntil:'domcontentloaded',timeout:60000});
    await page.getByRole('main').waitFor();
    await pause(2500);
    await chapter('03 从风格灵感到衣橱练习', '浏览原创虚构人物示范，探索不同搭配方向');
    await page.getByRole('main').evaluate(el => window.scrollBy(0,300));
    await pause(3500);
    await chapter('源码与交付版本可追溯', '公开仓库 AIdol｜开源基础与团队新增详见 README｜维护至11月10日');
    return {steps,finished:true,url:page.url()};
  } finally {
    await page.screencast.stop();
  }
}
