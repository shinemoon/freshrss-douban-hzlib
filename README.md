# FreshRSS LibScan

为 FreshRSS 中标题链接指向豆瓣图书页面的条目显示杭州图书馆馆藏速查结果。

## 当前行为

- 处理链接匹配 `https://book.douban.com/subject/xxxx` 和 `https://www.douban.com/doubanapp/dispatch/book/xxxx` 的条目。
- 书名优先读取标题链接的 `title` 属性，缺失时回退到可见文本。
- 使用扩展后端代理访问杭州图书馆检索页，避免浏览器跨域限制。
- 绿色表示检索到在馆结果。
- 红色表示检索成功但当前没有在馆结果。
- 灰色表示请求失败或页面解析失败。

## 安装

1. 将 `xExtension-LibScan` 放到 FreshRSS 的 `extensions` 目录。
2. 在 FreshRSS 扩展管理页面启用 `Douban Hangzhou Library Scan`。

## 限制

- 当前判定规则按杭州图书馆检索页中的“在馆”数字工作，不做作者或版本精确匹配。
- 如果杭州图书馆检索页 HTML 结构变化，解析逻辑可能需要同步调整。