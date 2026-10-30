<script setup lang="ts">
usePageSeo({
  title: 'Fast Note Sync · Obsidian 笔记同步与知识分享',
  description: '在自己的服务器同步 Obsidian 笔记与附件，管理个人笔记库，通过受控链接分享知识。Fast Note Sync 让记录跨设备连接，让知识持续生长。',
  robots: 'index, follow',
  canonicalPath: '/',
})
</script>
<template>
  <section class="hero">
    <div>
      <div class="eyebrow">
        <span class="status-dot" /> YOUR NOTES, CONNECTED
      </div>
      <h1>每一次记录，<br />都让知识<span class="accent">更进一步。</span></h1>
      <p class="lede">
        从 Obsidian 到你的知识空间。让灵感跨设备同步，让值得分享的内容被看见。
      </p>
      <div class="actions">
        <UButton to="/login" size="xl"
          >进入我的工作区 <span aria-hidden="true">→</span></UButton
        >
      </div>
      <p class="subtle">你的笔记，你的服务器，你的知识。</p>
    </div>
    <div class="notebook" aria-label="知识空间预览">
      <div class="notebook-bar">
        <span class="status-dot" /> MY KNOWLEDGE SPACE <span>↗</span>
      </div>
      <div class="notebook-body">
        <div class="eyebrow">想法 / 长期主义</div>
        <h2>把零散的想法，<br />连成自己的世界。</h2>
        <p>好的记录，是思考的开始。<br />让每一条笔记都有再次相遇的机会。</p>
        <div class="note-tags">
          <span>灵感收集</span><span>知识连接</span><span>持续生长</span>
        </div>
        <div class="note-line" />
        <div class="note-line short" />
        <div class="notebook-foot">
          ✦ 一点一滴，构建你的知识花园 <span>01 / 03</span>
        </div>
      </div>
    </div>
  </section>
  <section class="features">
    <article>
      <span class="feature-number">01 / SYNC</span>
      <h3>思路，从不中断</h3>
      <p>沿用 Fast Note Sync 的同步能力，让不同设备上的记录保持连接。</p>
    </article>
    <article>
      <span class="feature-number">02 / ORGANIZE</span>
      <h3>为知识找到归处</h3>
      <p>在工作区查看笔记库和最近笔记，回到熟悉的管理工具继续整理。</p>
    </article>
    <article>
      <span class="feature-number">03 / SHARE</span>
      <h3>让想法走得更远</h3>
      <p>用受控的分享链接打开一篇笔记，让知识在交流中生长。</p>
    </article>
  </section>
</template>
