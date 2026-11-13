<script setup lang="ts">
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
    <p v-if="error" class="label save-error" role="status">{{ error }}</p>
  </div>
</template>
