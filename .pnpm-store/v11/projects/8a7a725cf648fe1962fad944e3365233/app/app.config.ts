export default defineAppConfig({
  ui: {
    colors: {
      primary: 'violet',
      neutral: 'slate'
    },
    toaster: {
      slots: {
        viewport: 'fixed flex flex-col w-[calc(100%-2rem)] sm:w-[30rem] z-[100] data-[expanded=true]:h-(--height) focus:outline-none'
      },
      compoundVariants: [
        {
          position: ['top-center'],
          class: {
            viewport: '!top-14'
          }
        }
      ]
    },
    toast: {
      slots: {
        root: 'relative group overflow-hidden bg-muted shadow-lg rounded-lg ring ring-default p-4 flex gap-2.5 focus:outline-none',
        title: 'text-base font-medium text-highlighted',
        description: 'text-base text-muted'
      }
    }
  }
})
