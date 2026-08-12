# 发布记录

每次对 **https://kepu.printfilm.com/** / **https://admin.kepu.printfilm.com/** 的发布或线上热修，都在本目录留下一条记录。

## 约定

1. 文件名：`YYYY-MM-DD.md`（同一天多次发布写在同一文件，用二级标题区分次数）。
2. 发布完成后 **立刻**追加，不要攒到第二天。
3. 不要写入密码、EPAY_KEY、OSS Secret、JWT 等敏感信息。
4. 在下方「索引」表最上方插入一行（最新在上）。

## 记录模板

复制到当天文件：

```markdown
## YYYY-MM-DD HH:MM · 简述（全量 / 热修）

- **操作者**：
- **方式**：`deploy_kepu.py` 全量 / SSH 热修 / 其他
- **范围**：frontend / admin / api / worker / nginx / env
- **变更摘要**：
  - …
- **验证**：
  - [ ] `https://kepu.printfilm.com/api/health`
  - [ ] 前台首页 200
  - [ ] （如有）admin 首页 200
  - [ ] （如有）相关业务冒烟
- **备注 / 回滚**：
```

## 索引

| 日期 | 摘要 | 文件 |
|------|------|------|
| 2026-08-11 | 全量上线 + admin 域名 + 易支付/定价热修 | [2026-08-11.md](./2026-08-11.md) |
