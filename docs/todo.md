# 待办

Control Panel for Twitter 里在所有者的配置中生效、但是 xnote 决定暂时不做的设置项。
括号里是它们在那个扩展里的配置名。想要其中某一项时，单独拿出来做。

## 与 ADR-0001 冲突，不做

- 悬浮卡片里显示账号所在地（`addUserHoverCardAccountLocation`）：那个扩展为此自己调用 X 的内部接口 `AboutAccountQuery`。

## 有账号风险，不做

- 「关注」时间线按最新排序（`sortFollowing`）：做法是改写 X 发出的请求参数。
- 快速屏蔽，跳过确认对话框（`fastBlock`）：替用户自动点击「屏蔽」的确认按钮。

## 每项都是一小块独立功能，想念时再做

- 恢复帖子来源标签（`restoreTweetSource`）。
- 恢复外部链接下的标题（`restoreLinkHeadlines`）。
- 恢复帖子下的「引用」链接和其他互动链接（`restoreQuoteTweetsLink`、`restoreOtherInteractionLinks`）。
- 菜单里的「添加屏蔽词」（`addAddMutedWordMenuItem`）。
- 对特定帖子隐藏引用（`mutableQuoteTweets`）。

## 出现的页面少，逐页适配的成本高

- 隐藏关注者列表里的「认证」标签页（`hideVerifiedNotificationsTab`）。
- 隐藏订阅相关的入口（`hideSubscriptions`）。
- 隐藏「编辑图片」（`hideEditImage`）。
- 隐藏搜索页的推荐内容（`hideSuggestedContentSearch`）。
- 查看引用时隐藏被引用的帖子（`tweakQuoteTweetsPage`）。
- Premium 推销里必须用脚本标记的部分（`hideTwitterBlueUpsells` 的其余规则）。
- 「经典推特风格」的其余部分：网站图标（favicon）、其余页面上的「帖子」字样。

## 在所有者的配置里本来就不生效，不需要做

- 回复的默认排序（`sortReplies`）：值是「相关」，这就是 X 的默认行为。
- Premium 回复的 4 个显示设置和粉丝数阈值（`showPremiumReply*`、`showBlueReplyFollowersCountAmount`）：上级开关 `hideTwitterBlueReplies` 是关的。
- 主页时间线重定向（`disabledHomeTimelineRedirect`）：上级开关 `disableHomeTimeline` 是关的。
- 7 个隐藏计数的设置项（`hide*Metrics`）：上级开关 `hideMetrics` 是关的。
- 媒体和卡片占满帖子宽度（`fullWidthMedia`）：只在 `fullWidthContent` 开启时起作用。
- 在帖子详情页显示书签按钮（`showBookmarkButtonUnderFocusedTweets`）：只在 `hideBookmarkButton` 开启时起作用。
- 深色模式主题（`darkModeTheme`）：那个扩展用它判断主题，不是一个可见的功能。
