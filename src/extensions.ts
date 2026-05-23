import { app } from '@wix/astro/builders';
import myPage from './extensions/dashboard/pages/my-page/my-page.extension.ts';
import forumWidget from './extensions/site/widgets/forum-widget/forum-widget.extension.ts';
import appInstalled from './extensions/backend/events/app-installed/app-installed.extension.ts';

export default app()
  .use(myPage)
  .use(forumWidget)
  .use(appInstalled)
