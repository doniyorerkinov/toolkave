<script setup lang="ts">
interface FaqItem {
  q: string
  a: string
}

const props = defineProps<{ items: FaqItem[] }>()
const { t } = useI18n()

// FAQPage structured data — this block is the SEO text for the page.
useHead({
  script: [
    {
      type: 'application/ld+json',
      innerHTML: JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        mainEntity: props.items.map(item => ({
          '@type': 'Question',
          name: item.q,
          acceptedAnswer: { '@type': 'Answer', text: item.a }
        }))
      })
    }
  ]
})
</script>

<template>
  <section>
    <h2 class="text-xl font-semibold tracking-tight text-slate-900">{{ t('shell.faq') }}</h2>
    <dl class="mt-4 divide-y divide-slate-200 border-t border-slate-200">
      <div v-for="(item, index) in items" :key="index" class="py-4">
        <dt class="font-medium text-slate-900">{{ item.q }}</dt>
        <dd class="mt-1.5 max-w-prose leading-relaxed text-slate-600">{{ item.a }}</dd>
      </div>
    </dl>
  </section>
</template>
