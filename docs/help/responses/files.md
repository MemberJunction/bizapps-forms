# Find uploaded files

The CV, the photograph or the signed form somebody attached to their response, downloaded onto your
own machine.

## Before you start

- A form with a **File upload** question on it, and a response that answered it. The question types
  are in [The 25 question types](../build/question-types.md).

## Download a file

1. Open the form, choose the **Responses** tab, and click the response you want.
2. Find the question the file was attached to. Instead of a typed answer, its answer is the file's
   name, with the size beside it.
3. Click the name. The file downloads, exactly as the respondent sent it.

The name is a button and the file is what it gives you. Beside it sits a small square-and-arrow
button, whose tooltip reads **Open the file record for** and then the file's name: that opens
MemberJunction's record *about* the file — who uploaded it, when, how big — which is occasionally
what you want and is never the file itself.

A sketch made with a **Doodle** question behaves the same way. It is stored as an image file like
any other, so it downloads rather than appearing in the response.

## Two badges that mean the file is not coming

**Revoked** — somebody deleted the stored file. Its tooltip says so:
**This file has been revoked and is no longer retrievable**. The file name stays visible so that you
can see what was submitted, but it is no longer a button, because there are no longer any bytes
behind it to fetch. Nothing you can do in MJ Forms brings it back.

**Details unavailable** — **A file was submitted, but its upload record could not be read.
Downloading it may still work.** The file is probably fine; what MJ Forms could not read is the row
describing it, so it cannot show you the name or the size with any confidence. Try the download.

## What a respondent can attach

Up to 10 MB per file, unless whoever installed MJ Forms set a different limit, and only file types
they allowed — commonly images, PDFs, plain text and Office documents.

A respondent who picks something too big is told so plainly, in a sentence naming the limit your
server actually enforces, and the form offers **Retry upload**. A respondent whose file is refused
for any other reason reads **That file was not accepted. Try a different file.** — which is honest
about the one thing that matters: trying the same file again will fail the same way, and what they
need is a different file.

Neither refusal costs them their other answers. The form is still there, still filled in, and they
can pick another file and carry on.

## Files are not in the export

The spreadsheet carries a reference to each file rather than the file, so this tab is how you get at
what people actually sent. On a form collecting ten CVs that is ten clicks; there is no way to
download them as a batch. See [Export responses](export.md).

## What happens next

The file is in your downloads folder and the response is untouched — downloading reads, and records
nothing against the respondent. A file you have downloaded stays available to download again, from
the same place, for as long as it is stored.

## Related

- [Read responses](read-responses.md) — the rest of the response the file is attached to.
- [Export responses](export.md) — why the file itself is not in the spreadsheet.
- [The 25 question types](../build/question-types.md) — **File upload**, **Doodle**, and what each
  one asks a respondent to do.
