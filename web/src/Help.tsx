import { REPO } from "./github";
import { useSource } from "./source";
import { useStore } from "./store";

export function Help() {
  const { lang, idx } = useStore();
  const { custom, openDialog } = useSource();
  const file = `${lang ?? "xx"}.json`;

  return (
    <div className="help">
      <h1>How to contribute</h1>
      <ol>
        <li>
          In <b>Translate</b>, pick your language and fill in the title (required) and short description (optional). Work
          saves in this browser.
        </li>
        {REPO ? (
          <li>
            Click <b>Submit</b>. With a GitHub token it opens the pull request for you; without one it downloads{" "}
            <code>{file}</code> and opens GitHub's upload page.
          </li>
        ) : (
          <li>
            Click <b>Export</b> to download <code>{file}</code> and send it as a pull request adding{" "}
            <code>translations/{file}</code>.
          </li>
        )}
        <li>A check validates it and a maintainer reviews and merges it into the database.</li>
      </ol>
      <ul>
        <li>Plain text only, no HTML.</li>
        <li>
          <b>Needs review</b>: the English changed after you translated. Check it, then edit any field to confirm.
        </li>
        <li>To continue on another device, export a file and use <b>...</b> &gt; Import.</li>
      </ul>
      <p className="muted">
        Data: <code>{idx.snap.source ?? idx.snap.dbFile}</code>
        {custom ? " (custom)" : ""}, {idx.snap.topics.length} topics.{" "}
        <button className="link" onClick={openDialog}>
          Change
        </button>
      </p>
    </div>
  );
}
