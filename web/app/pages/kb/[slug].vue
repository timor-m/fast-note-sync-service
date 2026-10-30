<script setup lang="ts">
const route = useRoute()
if (route.params.slug !== 'demo')
  throw createError({
    statusCode: 404,
    message: '知识库不存在；当前仅提供 demo 演示知识库',
  })
const articles = [
  {
    category: '开始',
    title: '欢迎来到知识花园',
    description: '从一条笔记开始，建立自己的知识空间。',
    content: '这是一篇演示文章。真实知识库发布与文章 API 将在后续阶段接入。',
  },
  {
    category: '记录',
    title: '建立轻量的每日记录习惯',
    description: '给想法一个稳定的落点。',
    content:
      '每天留一点时间，写下发现、问题与灵感。此内容仅用于展示界面，不来自你的笔记。',
  },
  {
    category: '连接',
    title: '让记录成为思考的起点',
    description: '在重复回顾中发现新的连接。',
    content: '定期回顾并整理记录，让想法继续生长。这是明确标识的模拟数据。',
  },
]
const selected = ref(0)
usePageSeo({ title: '知识花园（演示） · Fast Note Sync', description: 'Fast Note Sync 公开知识库界面演示，内容为演示数据。' })
</script>
<template>
  <section class="page-heading">
    <div>
      <div class="eyebrow">PUBLIC KNOWLEDGE / DEMO</div>
      <h1>一座持续生长的知识花园</h1>
      <p class="lede">记录学习的过程，也分享沿途的发现。</p>
    </div>
    <UBadge color="warning" variant="soft">演示数据 · 非真实 API</UBadge>
  </section>
  <div class="workspace-grid">
    <aside class="panel">
      <div class="eyebrow">CONTENTS / {{ articles.length }} 篇</div>
      <h2>目录导航</h2>
      <button
        v-for="(article, i) in articles"
        :key="article.title"
        class="vault-button"
        :class="{ active: selected === i }"
        @click="selected = i"
      >
        {{ article.category }} · {{ article.title }}
      </button>
    </aside>
    <section class="panel">
      <div class="eyebrow">{{ articles[selected]?.category }}</div>
      <h2>{{ articles[selected]?.title }}</h2>
      <p class="lede">{{ articles[selected]?.description }}</p>
      <p>{{ articles[selected]?.content }}</p>
      <div class="demo-notice">
        第一阶段界面演示：尚未连接公开知识库发布接口。
      </div>
    </section>
  </div>
</template>
