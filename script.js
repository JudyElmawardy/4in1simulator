// =====================================================
// E-JUST GPA Simulator: everything in one file
// Rules come from the CSIT Student Academic Handbook 2025/2026
// =====================================================

// ---------- rules ----------
const GRADE_POINTS = {
    'A+': 4.0,
    'A': 3.7,
    'B+': 3.3,
    'B': 3.0,
    'C+': 2.7,
    'C': 2.3,
    'D+': 2.0,
    'D': 1.7,
    'F': 1.0,
    'WF': 1.0, // withdrawn failing counts like an F
};
const FAILING_GRADES = ['F', 'WF'];

// Tables 7 and 8: best grade first
const CSIT_CUTOFFS = [
    { grade: 'A+', minPercent: 95 },
    { grade: 'A', minPercent: 90 },
    { grade: 'B+', minPercent: 85 },
    { grade: 'B', minPercent: 80 },
    { grade: 'C+', minPercent: 75 },
    { grade: 'C', minPercent: 70 },
    { grade: 'D+', minPercent: 65 },
    { grade: 'D', minPercent: 60 },
    { grade: 'F', minPercent: 0 },
];
// FIBH and University Requirements / Liberal Arts: only D changes (50 instead of 60)
const LIBERAL_ARTS_CUTOFFS = CSIT_CUTOFFS.map((cutoff) =>
    cutoff.grade === 'D' ? { ...cutoff, minPercent: 50 } : cutoff
);

const MARKS_PER_CREDIT_HOUR = 100;
const MIN_CREDITS_PER_SEMESTER = 12;
const MAX_CREDITS_PER_SEMESTER = 18;
const PROBATION_CGPA = 2.0;
const PROBATION_MAX_CREDITS = 12;
const STORAGE_KEY = 'ejust-gpa-student-info';
const EPSILON = 1e-9; // protects comparisons from floating point noise

// ---------- helpers ----------
function getCutoffs(courseType) {
    return courseType === 'ur' ? LIBERAL_ARTS_CUTOFFS : CSIT_CUTOFFS;
}

// marks needed for a percentage, multiplying first so 95% of 300 is exactly 285
function marksForPercent(percent, totalMarks) {
    return (percent * totalMarks) / 100;
}

// index of the grade these marks earn (cutoffs are ordered best to worst)
function findGradeIndex(earnedMarks, totalMarks, cutoffs) {
    return cutoffs.findIndex(
        (cutoff) => earnedMarks >= marksForPercent(cutoff.minPercent, totalMarks) - EPSILON
    );
}

// a mark you still need is rounded up to a tenth, never more than that
function roundUpToTenth(value) {
    return Math.ceil(value * 10 - EPSILON) / 10;
}

function showMessages(box, messages) {
    box.replaceChildren(
        ...messages.map((text) => {
            const paragraph = document.createElement('p');
            paragraph.textContent = text;
            return paragraph;
        })
    );
}

// =====================================================
// 1. STUDENT INFO
// =====================================================
const gpaForm = document.getElementById('gpa-form');
const facultySelect = document.getElementById('faculty');
const semesterSelect = document.getElementById('sem');
const currentCgpaInput = document.getElementById('current-cgpa');
const completedHoursInput = document.getElementById('completed-hours');

function saveStudentInfo() {
    try {
        localStorage.setItem(
            STORAGE_KEY,
            JSON.stringify(
                {
                faculty: facultySelect.value,
                semester: semesterSelect.value,
                currentCgpa: currentCgpaInput.value,
                completedHours: completedHoursInput.value,
            }
                )
     catch (error) {
        // storage can be blocked, the simulator still works without it
    }
}

function loadStudentInfo() {
    try {
        const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
        if (!saved) return;
        if (saved.faculty) facultySelect.value = saved.faculty;
        if (saved.semester) semesterSelect.value = saved.semester;
        if (saved.currentCgpa) currentCgpaInput.value = saved.currentCgpa;
        if (saved.completedHours) completedHoursInput.value = saved.completedHours;
    } catch (error) {
        // ignore broken saved data
    }
}

// 32 / 64 / 96 completed credit hours move you up a level
function getYearLevel(completedHours) {
    if (completedHours >= 96) return 4;
    if (completedHours >= 64) return 3;
    if (completedHours >= 32) return 2;
    return 1;
}

[facultySelect, semesterSelect, currentCgpaInput, completedHoursInput].forEach((field) => {
    field.addEventListener('change', saveStudentInfo);
});

// =====================================================
// 2. GPA & CGPA SIMULATOR
// =====================================================
const courseList = document.getElementById('gpa-course-list');
const semesterGpaOutput = document.getElementById('semester-gpa');
const projectedCgpaOutput = document.getElementById('projected-cgpa');
const semesterHoursOutput = document.getElementById('semester-hours');
const totalHoursOutput = document.getElementById('total-hours');
const gpaMessagesBox = document.getElementById('gpa-messages');

// clean copy of the first row so "Add Course" can clone it
const emptyCourseRow = courseList.firstElementChild.cloneNode(true);

function addCourseRow() {
    courseList.appendChild(emptyCourseRow.cloneNode(true));
}

function removeCourseRow(row) {
    // never leave the table empty, clear the last row instead
    if (courseList.children.length === 1) {
        row.replaceWith(emptyCourseRow.cloneNode(true));
        return;
    }
    row.remove();
}

courseList.addEventListener('click', (event) => {
    const removeButton = event.target.closest('.remove-course');
    if (removeButton) removeCourseRow(removeButton.closest('tr'));
});

function readCourses() {
    return [...courseList.querySelectorAll('tr')].map((row) => ({
        credits: Number(row.querySelector('.gpa-credit-hours').value),
        grade: row.querySelector('.gpa-course-grade').value,
    }));
}

function calculateSemester(courses) {
    let qualityPoints = 0;
    let semesterHours = 0;
    let passedHours = 0;

    courses.forEach(({ credits, grade }) => {
        qualityPoints += credits * GRADE_POINTS[grade];
        semesterHours += credits;
        if (!FAILING_GRADES.includes(grade)) passedHours += credits;
    });

    return { qualityPoints, semesterHours, passedHours, semesterGpa: qualityPoints / semesterHours };
}

// exact for new courses; a retake would also need the old attempt removed
function calculateProjectedCgpa(currentCgpa, completedHours, semester) {
    const totalPoints = currentCgpa * completedHours + semester.qualityPoints;
    const totalHours = completedHours + semester.semesterHours;
    return totalPoints / totalHours;
}

// messages use the 2-decimal values the student sees, so text and numbers always agree
function buildGpaMessages(info, semester, projectedCgpa) {
    const messages = [];
    const level = getYearLevel(info.completedHours);
    messages.push(`${info.faculty} student, semester ${info.semester}, level ${level} based on your completed hours.`);

    const underProbationNow = info.currentCgpa < PROBATION_CGPA;
    const maxCredits = underProbationNow ? PROBATION_MAX_CREDITS : MAX_CREDITS_PER_SEMESTER;

    if (semester.semesterHours > maxCredits) {
        messages.push(`You registered ${semester.semesterHours} credit hours. The limit for you is ${maxCredits}.`);
    } else if (semester.semesterHours < MIN_CREDITS_PER_SEMESTER) {
        messages.push(`The usual minimum is ${MIN_CREDITS_PER_SEMESTER} credit hours per semester.`);
    }

    if (projectedCgpa < PROBATION_CGPA) {
        messages.push('Your projected CGPA is below 2.00, which means academic probation.');
    } else if (underProbationNow) {
        messages.push('This semester would bring you back to 2.00 or above and end your probation.');
    } else if (projectedCgpa >= 3.85) {
        messages.push('A CGPA of 3.85 or more qualifies for a 40% discount next year.');
    } else if (projectedCgpa >= 3.7) {
        messages.push('A CGPA of 3.7 or more qualifies for a 20% discount next year.');
    }

    return messages;
}

function clearGpaResults() {
    semesterGpaOutput.value = '--';
    projectedCgpaOutput.value = '--';
    semesterHoursOutput.value = '--';
    totalHoursOutput.value = '--';
    gpaMessagesBox.replaceChildren();
}

function calculateGpa() {
    // runs the required / min / max rules from the HTML
    if (!gpaForm.reportValidity()) return;

    const info = {
        faculty: facultySelect.value,
        semester: semesterSelect.value,
        currentCgpa: Number(currentCgpaInput.value),
        completedHours: Number(completedHoursInput.value),
    };

    const semester = calculateSemester(readCourses());
    const projectedCgpa = Number(
        calculateProjectedCgpa(info.currentCgpa, info.completedHours, semester).toFixed(2)
    );

    semesterGpaOutput.value = semester.semesterGpa.toFixed(2);
    projectedCgpaOutput.value = projectedCgpa.toFixed(2);
    semesterHoursOutput.value = semester.semesterHours;
    totalHoursOutput.value = info.completedHours + semester.passedHours;

    showMessages(gpaMessagesBox, buildGpaMessages(info, semester, projectedCgpa));
    saveStudentInfo();
}

document.getElementById('calculate-gpa').addEventListener('click', calculateGpa);
document.getElementById('add-course').addEventListener('click', addCourseRow);

gpaForm.addEventListener('reset', () => {
    // the reset event fires before the fields are cleared, so wait a tick
    setTimeout(() => {
        courseList.replaceChildren(emptyCourseRow.cloneNode(true));
        clearGpaResults();
        try {
            localStorage.removeItem(STORAGE_KEY);
        } catch (error) {
            // ignore
        }
    }, 0);
});

// =====================================================
// 3. GRADE SIMULATOR
// =====================================================
const gradeForm = document.getElementById('grade-form');
const gradeCreditsSelect = document.getElementById('grade-credit-hours');
const gradeCourseTypeSelect = document.getElementById('grade-course-type');
const gradeMidtermInput = document.getElementById('grade-midterm-mark');
const gradeClassworkInput = document.getElementById('grade-classwork-mark');
const expectedFinalInput = document.getElementById('expected-final-mark');
const expectedGradeOutput = document.getElementById('expected-grade');

function calculateGrade() {
    if (!gradeForm.reportValidity()) return;

    const creditHours = Number(gradeCreditsSelect.value);
    const totalMarks = creditHours * MARKS_PER_CREDIT_HOUR;
    const earnedMarks =
        Number(gradeMidtermInput.value) +
        Number(gradeClassworkInput.value) +
        Number(expectedFinalInput.value);

    if (earnedMarks > totalMarks) {
        expectedGradeOutput.value = `Your marks add up to ${earnedMarks}, but a ${creditHours}-credit course only has ${totalMarks}.`;
        return;
    }

    const cutoffs = getCutoffs(gradeCourseTypeSelect.value);
    const gradeIndex = findGradeIndex(earnedMarks, totalMarks, cutoffs);
    const percentage = (earnedMarks / totalMarks) * 100;

    let resultText = `${cutoffs[gradeIndex].grade} (${percentage.toFixed(1)}%, ${earnedMarks}/${totalMarks})`;

    if (gradeIndex > 0) {
        const nextGrade = cutoffs[gradeIndex - 1];
        const marksToNextGrade = roundUpToTenth(
            marksForPercent(nextGrade.minPercent, totalMarks) - earnedMarks
        );
        resultText += `. ${marksToNextGrade} more marks for ${nextGrade.grade}.`;
    }

    expectedGradeOutput.value = resultText;
}

document.getElementById('calculate-grade').addEventListener('click', calculateGrade);

// =====================================================
// 4. FINAL & CLASSWORK TARGET
// =====================================================
const targetForm = document.getElementById('target-form');
const targetCourseTypeSelect = document.getElementById('target-course-type');
const targetMidtermInput = document.getElementById('target-midterm-mark');
const midtermTotalInput = document.getElementById('midterm-total');
const classworkCurrentInput = document.getElementById('classwork-current');
const classworkTotalInput = document.getElementById('classwork-total');
const finalTotalInput = document.getElementById('final-total');
const targetGradeSelect = document.getElementById('target-grade');
const classworkResultOutput = document.getElementById('classwork-result');
const finalResultOutput = document.getElementById('final-result');
const targetMessagesBox = document.getElementById('target-messages');

function calculateTarget() {
    if (!targetForm.reportValidity()) return;

    classworkResultOutput.value = '--';
    finalResultOutput.value = '--';

    const midtermMark = Number(targetMidtermInput.value);
    const midtermTotal = Number(midtermTotalInput.value);
    const classworkMark = Number(classworkCurrentInput.value);
    const classworkTotal = Number(classworkTotalInput.value);
    const finalTotal = Number(finalTotalInput.value);
    const targetGrade = targetGradeSelect.value;

    if (midtermMark > midtermTotal) {
        showMessages(targetMessagesBox, ['Your midterm mark is higher than the midterm total.']);
        return;
    }
    if (classworkMark > classworkTotal) {
        showMessages(targetMessagesBox, ['Your classwork mark is higher than the classwork total.']);
        return;
    }

    const cutoffs = getCutoffs(targetCourseTypeSelect.value);
    const totalMarks = midtermTotal + classworkTotal + finalTotal;

    // F is "anything below D", so there is nothing to aim for
    if (targetGrade === 'F') {
        const passCutoff = cutoffs.find((cutoff) => cutoff.grade === 'D');
        const passMarks = roundUpToTenth(marksForPercent(passCutoff.minPercent, totalMarks));
        showMessages(targetMessagesBox, [
            `F means finishing below ${passMarks} out of ${totalMarks} (${passCutoff.minPercent}%).`,
        ]);
        return;
    }

    const targetCutoff = cutoffs.find((cutoff) => cutoff.grade === targetGrade);
    const marksNeededInTotal = marksForPercent(targetCutoff.minPercent, totalMarks);
    const marksNeededAfterMidterm = marksNeededInTotal - midtermMark;

    const messages = [
        `${targetGrade} needs ${roundUpToTenth(marksNeededInTotal)} out of ${totalMarks} (${targetCutoff.minPercent}%) in total.`,
    ];

    // the midterm alone already gets there
    if (marksNeededAfterMidterm <= EPSILON) {
        classworkResultOutput.value = 'No minimum';
        finalResultOutput.value = 'No minimum';
        messages.push(`Your midterm already secures a ${targetGrade}.`);
        showMessages(targetMessagesBox, messages);
        return;
    }

    // not reachable even if everything left is full marks
    if (marksNeededAfterMidterm > classworkTotal + finalTotal + EPSILON) {
        messages.push(`Even with full marks in classwork and the final, a ${targetGrade} is out of reach.`);
        showMessages(targetMessagesBox, messages);
        return;
    }

    // lowest classwork that still works if the final is a perfect score
    const classworkFloor = marksNeededAfterMidterm - finalTotal;
    if (classworkFloor <= EPSILON) {
        classworkResultOutput.value = 'No minimum';
    } else {
        classworkResultOutput.value = `at least ${roundUpToTenth(classworkFloor)} / ${classworkTotal}`;
        messages.push(`Classwork: even with a perfect final you need at least ${roundUpToTenth(classworkFloor)} out of ${classworkTotal}.`);
    }

    // final needed with the classwork mark you entered
    const finalNeeded = marksNeededAfterMidterm - classworkMark;
    if (finalNeeded <= EPSILON) {
        finalResultOutput.value = 'No minimum';
        messages.push(`With ${classworkMark} in classwork you already have enough for a ${targetGrade}.`);
    } else if (finalNeeded > finalTotal + EPSILON) {
        finalResultOutput.value = 'Not reachable';
        messages.push(`With ${classworkMark} in classwork, even a perfect final is not enough. Your classwork needs to be higher.`);
    } else {
        const finalPercent = (finalNeeded / finalTotal) * 100;
        finalResultOutput.value = `${roundUpToTenth(finalNeeded)} / ${finalTotal}`;
        messages.push(`With ${classworkMark} in classwork, you need ${roundUpToTenth(finalNeeded)} out of ${finalTotal} in the final (${finalPercent.toFixed(1)}%).`);
    }

    showMessages(targetMessagesBox, messages);
}

document.getElementById('calculate-target').addEventListener('click', calculateTarget);

// =====================================================
loadStudentInfo();
