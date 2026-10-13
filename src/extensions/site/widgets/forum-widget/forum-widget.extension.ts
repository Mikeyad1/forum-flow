import { extensions } from '@wix/astro/builders';

export default extensions.customElement({
  id: '1ed31ae0-008b-4d7d-8d06-a2c9af1f1b7f',
  name: 'ForumFlow Widget',
  width: {
    defaultWidth: 520,
    allowStretch: true,
  },
  height: {
    defaultHeight: 360,
  },
  installation: {
    autoAdd: true,
  },
  settings: './extensions/site/widgets/forum-widget/settings-panel.tsx',
  presets: [
    {
      id: '353d28be-48d1-4310-a7f8-10a43b1205f1',
      name: 'ForumFlow',
      thumbnailUrl: '{{BASE_URL}}/forumflow-thumbnail.png',
    },
  ],
  tagName: 'forum-widget',
  element: './extensions/site/widgets/forum-widget/forum-widget.tsx',
});
