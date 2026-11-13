<script setup lang="ts">
import ErrorTag from './ErrorTag.vue'

/** The Save button and the "Saved" / error tag every settings form ends with. */
withDefaults(defineProps<{ saved?: boolean; error?: string; label?: string }>(), {
  saved: false,
  error: '',
  label: 'Save',
})
</script>

<template>
  <div class="save-row">
    <button type="submit" class="btn btn-primary">{{ label }}</button>
    <p v-if="saved" class="label save-ok" role="status">Saved</p>
    <ErrorTag :message="error" />
  </div>
</template>
