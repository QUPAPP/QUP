import { contentProblemMessages } from "@/lib/question-form";
import { ErrorNotice } from "../../status";

/** The API's error in Arabic, with one line per broken content rule when it has them. */
export function ContentErrorNotice({ error }: { error: unknown }) {
  const problems = contentProblemMessages(error);
  return (
    <ErrorNotice error={error}>
      {problems.length > 0 ? (
        <ul className="problem-list">
          {problems.map((problem) => (
            <li key={problem}>{problem}</li>
          ))}
        </ul>
      ) : null}
    </ErrorNotice>
  );
}
