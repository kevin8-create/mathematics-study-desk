# 数学自习室 · Mathematics Study Desk

西交利物浦大学 MTH026 微积分 I 与 MTH028 线性代数 I 的独立期末复习工具。题库按知识点、题型与难度组织。提交后可查看双语解析和关联变式，解答题可对照步骤自行评分。

An independent final-exam study tool for XJTLU MTH026 Calculus I and MTH028 Linear Algebra I. Filter by topic, format, or level. Submit to see worked bilingual solutions and related variations. Written answers are self-graded against the worked solution.

## 运行 · Run

```sh
python -m http.server 8080 --bind 127.0.0.1
```

打开 `http://127.0.0.1:8080`。网页所需的 KaTeX 与字体随源码提供。首次成功载入后，受支持的浏览器可以离线打开网页应用。使用下面的命令可在 Windows 上构建便携桌面版。

Open `http://127.0.0.1:8080`. KaTeX and its fonts ship with the source. After the first successful load, supported browsers can open the web app offline. Build the portable Windows edition with the following command.

```powershell
& .\scripts\build-desktop.ps1
```

## 更新题库 · Update the bank

编辑 `content/` 中对应课程的 `topics` 和 `questions`，然后执行 `node scripts/build-bank.mjs` 验证并生成 `bank.json`。更新已有题目时保留题号，以保留对应的做题记录。数学表达式使用 `$…$` 或 `$$…$$`。分式使用 `\frac`，矩阵使用 `bmatrix`。

Edit the course's `topics` and `questions` in `content/`, then use `node scripts/build-bank.mjs` to validate and regenerate `bank.json`. Keep IDs stable when updating existing questions so attempts stay associated with them. Use `$…$` or `$$…$$` for TeX, `\frac` for fractions, and `bmatrix` for matrices.

导入题库使用 `{"version":1,"questions":[…]}`，题号以 `local-` 开头，知识点编号取自公共题库。导入、本机草稿和做题进度保存在当前浏览器。

Import a bank as `{"version":1,"questions":[…]}`, with IDs starting in `local-` and topic IDs from the public bank. Imports, scratch work, and study progress are stored in the current browser.

## 课程参考 · Course references

- [MTH026 Calculus I](https://modules.xjtlu.edu.cn/mod?mod_code=MTH026&psl_code=SEM1)
- [MTH028 Linear Algebra I](https://modules.xjtlu.edu.cn/mod?mod_code=MTH028&psl_code=SEM1)
- [MTH028 teaching plan](https://jiayexu.quarto.pub/mth028-syllabus/)

代码与原创题库采用 MIT 许可。KaTeX 保留 [其许可](vendor/katex/LICENSE)。

The source code and original question bank are MIT licensed. KaTeX retains [its license](vendor/katex/LICENSE).
