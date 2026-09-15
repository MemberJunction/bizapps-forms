# Require and check answers

A question nobody can skip, and an answer that arrives in the shape you can use.

## Before you start

- A question on the canvas, selected, so that **Question settings** is showing it. See
  [Add and arrange questions](add-and-arrange-questions.md).
- Two things worth knowing apart. *Required* is about whether an answer arrives at all.
  *Validation* is about whether the answer that arrived is any good. You can use either without the
  other.

## Set the rules for one question

1. Click the question on the canvas. **Question settings** on the right fills in with its wording
   and its switches.
2. Turn on **Required** to make the question compulsory. The hint beside it is the whole of what it
   does: **The respondent cannot continue without answering.** The card on the canvas grows a
   **Required** badge, and the respondent sees the question marked as needed before the form will
   submit.
3. Turn on **Answer validation** to check the *content* of the answer:
   **Reject an answer that does not match, and tell the respondent why.** The switch opens a panel
   of fields underneath it.
4. Fill in whichever of the fields apply. Which ones you get depends on the question's type, and a
   type with none of them says so: **No validation options for this question type.**
   - **Min length** and **Max length**, on text questions, count characters. Use **Min length** to
     stop a one-word answer to a question that deserves a paragraph.
   - **Minimum value** and **Maximum value**, on numbers and scales, bound the number itself. A
     guest count between 1 and 8; an age of at least 18.
   - **Pattern (regular expression)** and **Message shown when the pattern fails** are the pair
     below. See the next section: most authors should leave both empty.
5. Leave the panel. There is no save button — the rule is written as you type, and it applies from
   the next time you publish.

## About the pattern field

**Pattern (regular expression)** takes a piece of notation that describes the *shape* of an
acceptable answer: two capital letters followed by digits, say, or a postcode. It is a small
programming language, it is unforgiving, and a pattern that is slightly wrong rejects perfectly good
answers without telling you it is doing it.

*If you do not already write these, leave it empty.* Nothing else on this panel depends on it, and
everything most forms need — a compulsory question, a length, a range, an email that is really an
email — is handled without it. **Email**, **Phone number** and **Website** questions already check
their own format, so the commonest reason people reach for a pattern does not apply.

If you do fill it in, fill in **Message shown when the pattern fails** as well. That is the sentence
the respondent reads when their answer is refused, and it is the only chance you get to tell them
what you wanted. Left empty, they are told **Value is not in the expected format.** and nothing
more, which is how a form ends up with somebody trying six spellings of their own reference number.

## When the two bounds contradict each other

Set a minimum above its maximum and MJ Forms says so on the spot, naming both numbers — a minimum
length of 20 against a maximum of 10 reads
`Minimum (20) is above maximum (10), so no answer can satisfy this range.` — and adds the sentence
that matters: **Answer validation is not saved until this is fixed.**

That second line is not a warning you can work around. Nothing on the panel is written while the
contradiction stands, so closing the question and coming back leaves the validation as it was. Both
boxes stay on screen while the message is up, because they are the two numbers you have to
reconcile. Change either one and the message goes.

## What happens next

The rules are part of the form from your next publish, not from now. Until then the live form keeps
checking whatever it was checking before.

You can see them working without sending anyone the link: press **Preview** in the bar above the
tabs and answer the question badly. A respondent gets the same refusal, in the same words, and
nothing else they have typed is lost.

## Related

- [The 25 question types](question-types.md) — which fields each type offers, and which offer none.
- [Show, skip and branch](logic.md) — the other half of **Question settings**: deciding who sees
  this question at all.
- [Glossary](../reference/glossary.md) — *validation*, *required*, *respondent* and the rest, in the
  sense MJ Forms means them.
