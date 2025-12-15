import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Generate Subject-wise Marksheet PDF
 * Shows all students' marks for a specific subject in an exam
 */
export const generateSubjectMarksheet = async (exam, subject, marksEntries, outputPath) => {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 50, size: 'A4' });
      const stream = fs.createWriteStream(outputPath);
      doc.pipe(stream);

      // Header
      doc.fontSize(20).font('Helvetica-Bold')
        .text('VEDA AGAMA SAMSKRUTHA MAHA PATASHALA', { align: 'center' });
      doc.moveDown(0.5);
      doc.fontSize(16).font('Helvetica')
        .text('VED VIGNAN MAHA VIDYA PEETH', { align: 'center' });
      doc.moveDown(0.5);
      doc.fontSize(12).font('Helvetica')
        .text('Sri Sri Gurukul, 21st K.M. Kanakpura Road, Udayapura, Bengaluru - 560082', { align: 'center' });
      doc.moveDown(1);

      // Exam Details
      doc.fontSize(14).font('Helvetica-Bold')
        .text('EXAM MARKSHEET - SUBJECT WISE', { align: 'center' });
      doc.moveDown(0.5);
      doc.fontSize(12).font('Helvetica')
        .text(`Exam: ${exam.name || exam.examName}`, { align: 'center' });
      doc.text(`Subject: ${subject.name}`, { align: 'center' });
      doc.text(`Date: ${exam.examDate ? new Date(exam.examDate).toLocaleDateString('en-IN') : 'N/A'}`, { align: 'center' });
      doc.text(`Academic Year: ${exam.academicYear || exam.academicInfo?.academicYear || 'N/A'}`, { align: 'center' });
      doc.moveDown(1);

      // Table Header
      const tableTop = doc.y;
      const rowHeight = 25;
      const colWidths = [60, 250, 120, 120, 120];
      const headers = ['S.No', 'Student Name', 'Admission No', 'Marks Obtained', 'Total Marks'];

      doc.fontSize(10).font('Helvetica-Bold');
      let x = 50;
      headers.forEach((header, i) => {
        doc.text(header, x, tableTop, { width: colWidths[i], align: i === 0 ? 'center' : 'left' });
        x += colWidths[i];
      });

      // Draw header line
      doc.moveTo(50, tableTop + 20)
        .lineTo(550, tableTop + 20)
        .stroke();

      // Table Rows
      doc.fontSize(9).font('Helvetica');
      let y = tableTop + 25;
      marksEntries.forEach((entry, index) => {
        if (y > 700) {
          doc.addPage();
          y = 50;
        }

        const student = entry.student || {};
        // Handle both enhanced exam structure (marksComponents) and basic structure (subjectMarks)
        let marksObtained = 0;
        let maxMarks = subject.maxMarks || 100;
        
        if (entry.marksComponents && entry.marksComponents.length > 0) {
          // Enhanced exam structure
          marksObtained = entry.totalMarks?.marksObtained || 
            entry.marksComponents.reduce((sum, c) => sum + (c.marksObtained || 0), 0);
          maxMarks = entry.totalMarks?.maxMarks || 
            entry.marksComponents.reduce((sum, c) => sum + (c.maxMarks || 0), 0);
        } else if (entry.subjectMarks && entry.subjectMarks.length > 0) {
          // Basic structure - find matching subject
          const subjectMark = entry.subjectMarks.find(sm => 
            sm.subject?._id?.toString() === subject._id?.toString() || 
            sm.subject?.toString() === subject._id?.toString()
          ) || entry.subjectMarks[0];
          marksObtained = subjectMark.marksObtained || 0;
          maxMarks = subjectMark.maxMarks || maxMarks;
        } else {
          // Fallback
          marksObtained = entry.totalMarks?.marksObtained || entry.totalMarksObtained || 0;
          maxMarks = entry.totalMarks?.maxMarks || entry.totalMaxMarks || maxMarks;
        }

        x = 50;
        doc.text(String(index + 1), x, y, { width: colWidths[0], align: 'center' });
        x += colWidths[0];
        doc.text(student.fullName || student.personalInfo?.fullName || 'N/A', x, y, { width: colWidths[1], align: 'left' });
        x += colWidths[1];
        doc.text(student.admissionNo || student.studentId || 'N/A', x, y, { width: colWidths[2], align: 'left' });
        x += colWidths[2];
        doc.text(String(marksObtained), x, y, { width: colWidths[3], align: 'center' });
        x += colWidths[3];
        doc.text(String(maxMarks), x, y, { width: colWidths[4], align: 'center' });

        y += rowHeight;
      });

      // Summary
      doc.moveDown(1);
      const totalStudents = marksEntries.length;
      const presentStudents = marksEntries.filter(e => {
        if (e.attendance?.status) return e.attendance.status !== 'absent';
        return e.isPresent !== false;
      }).length;
      const totalMarks = marksEntries.reduce((sum, e) => {
        let marks = 0;
        if (e.marksComponents && e.marksComponents.length > 0) {
          marks = e.totalMarks?.marksObtained || e.marksComponents.reduce((s, c) => s + (c.marksObtained || 0), 0);
        } else if (e.subjectMarks && e.subjectMarks.length > 0) {
          const subjectMark = e.subjectMarks.find(sm => 
            sm.subject?._id?.toString() === subject._id?.toString() || 
            sm.subject?.toString() === subject._id?.toString()
          ) || e.subjectMarks[0];
          marks = subjectMark.marksObtained || 0;
        } else {
          marks = e.totalMarks?.marksObtained || e.totalMarksObtained || 0;
        }
        return sum + marks;
      }, 0);
      const averageMarks = presentStudents > 0 ? (totalMarks / presentStudents).toFixed(2) : '0.00';

      doc.fontSize(10).font('Helvetica-Bold')
        .text('SUMMARY', 50, doc.y);
      doc.fontSize(9).font('Helvetica')
        .text(`Total Students: ${totalStudents}`, 50, doc.y + 5)
        .text(`Present: ${presentStudents}`, 50, doc.y + 5)
        .text(`Absent: ${totalStudents - presentStudents}`, 50, doc.y + 5)
        .text(`Average Marks: ${averageMarks}`, 50, doc.y + 5);

      // Footer
      doc.fontSize(8).font('Helvetica')
        .text(`Generated on: ${new Date().toLocaleString('en-IN')}`, 50, 750, { align: 'left' });

      doc.end();
      stream.on('finish', () => resolve(outputPath));
      stream.on('error', reject);
    } catch (error) {
      reject(error);
    }
  });
};

/**
 * Generate Student-wise Marksheet PDF
 * Shows all subjects' marks for a specific student in a term/exam
 */
export const generateStudentMarksheet = async (student, examData, marksEntries, outputPath) => {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 50, size: 'A4' });
      const stream = fs.createWriteStream(outputPath);
      doc.pipe(stream);

      // Header
      doc.fontSize(20).font('Helvetica-Bold')
        .text('VEDA AGAMA SAMSKRUTHA MAHA PATASHALA', { align: 'center' });
      doc.moveDown(0.5);
      doc.fontSize(16).font('Helvetica')
        .text('VED VIGNAN MAHA VIDYA PEETH', { align: 'center' });
      doc.moveDown(0.5);
      doc.fontSize(12).font('Helvetica')
        .text('Sri Sri Gurukul, 21st K.M. Kanakpura Road, Udayapura, Bengaluru - 560082', { align: 'center' });
      doc.moveDown(1);

      // Student Details
      doc.fontSize(14).font('Helvetica-Bold')
        .text('STUDENT EXAM MARKSHEET', { align: 'center' });
      doc.moveDown(0.5);
      
      // Student Information Section
      const studentInfoY = doc.y;
      doc.fontSize(11).font('Helvetica');
      
      // Line 1: Name (left) and Admission No (right)
      doc.text(`Name: ${student.fullName || 'N/A'}`, 50, studentInfoY);
      doc.text(`Admission No: ${student.admissionNo || 'N/A'}`, 300, studentInfoY);
      doc.moveDown(0.7);
      
      // Line 2: Roll No (left) and Department (right)
      const secondLineY = doc.y;
      if (student.rollNo) {
        doc.text(`Roll No: ${student.rollNo}`, 50, secondLineY);
      }
      if (student.department) {
        const deptName = student.department.name || student.department || 'N/A';
        doc.text(`Department: ${deptName}`, 300, secondLineY);
      }
      doc.moveDown(1);

      // Exam/Term Information
      const examInfoY = doc.y;
      doc.fontSize(10).font('Helvetica-Bold');
      if (examData.academicYear) {
        doc.text(`Academic Year: ${examData.academicYear}`, 50, examInfoY);
      }
      if (examData.term) {
        doc.text(`Term: ${examData.term}`, 300, examInfoY);
      }
      doc.moveDown(0.5);

      // Table Header
      const tableTop = doc.y;
      const rowHeight = 25;
      const colWidths = [300, 150, 150];
      const headers = ['Subject', 'Marks Obtained', 'Total Marks'];

      doc.fontSize(10).font('Helvetica-Bold');
      let x = 50;
      headers.forEach((header, i) => {
        doc.text(header, x, tableTop, { width: colWidths[i], align: 'left' });
        x += colWidths[i];
      });

      // Draw header line
      doc.moveTo(50, tableTop + 20)
        .lineTo(550, tableTop + 20)
        .stroke();

      // Table Rows - iterate through all subjects in each marks entry
      doc.fontSize(9).font('Helvetica');
      let y = tableTop + 25;
      
      marksEntries.forEach((entry) => {
        // Check if we need a new page
        if (y > 700) {
          doc.addPage();
          y = 50;
        }

        // If entry has subjectMarks array, iterate through each subject
        if (entry.subjectMarks && entry.subjectMarks.length > 0) {
          entry.subjectMarks.forEach((subjectMark) => {
            // Check page break for each subject row
            if (y > 700) {
              doc.addPage();
              y = 50;
            }

            // Extract subject name
            const subjectName = subjectMark.subject?.name || 
                              subjectMark.subjectName || 
                              (typeof subjectMark.subject === 'string' ? subjectMark.subject : 'N/A');
            
            const marksObtained = subjectMark.marksObtained || 0;
            const maxMarks = subjectMark.maxMarks || 100;

            x = 50;
            doc.text(subjectName, x, y, { width: colWidths[0], align: 'left' });
            x += colWidths[0];
            doc.text(String(marksObtained), x, y, { width: colWidths[1], align: 'center' });
            x += colWidths[1];
            doc.text(String(maxMarks), x, y, { width: colWidths[2], align: 'center' });

            y += rowHeight;
          });
        } else {
          // Fallback: if no subjectMarks, show exam name as subject
          const subjectName = entry.exam?.name || entry.exam?.examName || 'N/A';
          const marksObtained = entry.totalMarksObtained || entry.totalMarks?.marksObtained || 0;
          const maxMarks = entry.totalMaxMarks || entry.totalMarks?.maxMarks || 100;

          x = 50;
          doc.text(subjectName, x, y, { width: colWidths[0], align: 'left' });
          x += colWidths[0];
          doc.text(String(marksObtained), x, y, { width: colWidths[1], align: 'center' });
          x += colWidths[1];
          doc.text(String(maxMarks), x, y, { width: colWidths[2], align: 'center' });

          y += rowHeight;
        }
      });

      // Overall Summary
      doc.moveDown(1);
      const totalMarks = marksEntries.reduce((sum, e) => {
        if (e.marksComponents && e.marksComponents.length > 0) {
          return sum + (e.totalMarks?.marksObtained || e.marksComponents.reduce((s, c) => s + (c.marksObtained || 0), 0));
        } else if (e.subjectMarks && e.subjectMarks.length > 0) {
          return sum + (e.subjectMarks[0].marksObtained || 0);
        }
        return sum + (e.totalMarks?.marksObtained || e.totalMarksObtained || 0);
      }, 0);
      const totalMax = marksEntries.reduce((sum, e) => {
        if (e.marksComponents && e.marksComponents.length > 0) {
          return sum + (e.totalMarks?.maxMarks || e.marksComponents.reduce((s, c) => s + (c.maxMarks || 0), 0));
        } else if (e.subjectMarks && e.subjectMarks.length > 0) {
          return sum + (e.subjectMarks[0].maxMarks || 100);
        }
        return sum + (e.totalMarks?.maxMarks || e.totalMaxMarks || 100);
      }, 0);
      const overallPercentage = totalMax > 0 ? ((totalMarks / totalMax) * 100).toFixed(2) : '0.00';
      const passedSubjects = marksEntries.filter(e => {
        if (e.result?.isPassed !== undefined) return e.result.isPassed;
        if (e.totalMarks?.isPassed !== undefined) return e.totalMarks.isPassed;
        return e.isPassed !== false;
      }).length;

      doc.fontSize(10).font('Helvetica-Bold')
        .text('OVERALL SUMMARY', 50, doc.y);
      doc.fontSize(9).font('Helvetica')
        .text(`Total Subjects: ${marksEntries.length}`, 50, doc.y + 5)
        .text(`Passed: ${passedSubjects}`, 50, doc.y + 5)
        .text(`Total Marks: ${totalMarks} / ${totalMax}`, 50, doc.y + 5)
        .text(`Overall Percentage: ${overallPercentage}%`, 50, doc.y + 5);

      // Footer
      doc.fontSize(8).font('Helvetica')
        .text(`Generated on: ${new Date().toLocaleString('en-IN')}`, 50, 750, { align: 'left' });

      doc.end();
      stream.on('finish', () => resolve(outputPath));
      stream.on('error', reject);
    } catch (error) {
      reject(error);
    }
  });
};

/**
 * Generate Complete Exam Report PDF
 * Shows all students and all subjects in a comprehensive table
 */
export const generateCompleteExamReport = async (exam, results, outputPath) => {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 50, size: 'A4', layout: 'landscape' });
      const stream = fs.createWriteStream(outputPath);
      doc.pipe(stream);

      // Header
      doc.fontSize(20).font('Helvetica-Bold')
        .text('VEDA AGAMA SAMSKRUTHA MAHA PATASHALA', { align: 'center' });
      doc.moveDown(0.5);
      doc.fontSize(16).font('Helvetica')
        .text('VED VIGNAN MAHA VIDYA PEETH', { align: 'center' });
      doc.moveDown(0.5);
      doc.fontSize(12).font('Helvetica')
        .text('Sri Sri Gurukul, 21st K.M. Kanakpura Road, Udayapura, Bengaluru - 560082', { align: 'center' });
      doc.moveDown(1);

      // Exam Details
      doc.fontSize(14).font('Helvetica-Bold')
        .text('COMPLETE EXAM REPORT', { align: 'center' });
      doc.moveDown(0.5);
      doc.fontSize(11).font('Helvetica');
      const examInfoY = doc.y;
      doc.text(`Exam: ${exam.name || exam.examName || 'N/A'}`, 50, examInfoY);
      doc.text(`Type: ${exam.examType || 'N/A'}`, 300, examInfoY);
      doc.moveDown(0.5);
      const dateY = doc.y;
      doc.text(`Date: ${exam.examDate ? new Date(exam.examDate).toLocaleDateString('en-IN') : 'N/A'}`, 50, dateY);
      doc.text(`Academic Year: ${exam.academicYear || exam.academicInfo?.academicYear || 'N/A'}`, 300, dateY);
      doc.moveDown(1);

      // Get all unique subjects from results
      const subjectsMap = new Map();
      results.forEach(result => {
        if (result.marks?.subjectMarks && result.marks.subjectMarks.length > 0) {
          result.marks.subjectMarks.forEach(sm => {
            const subId = sm.subject?._id?.toString() || sm.subject?.toString() || sm.subject;
            const subName = sm.name || sm.subjectName || sm.subject?.name || sm.subject || 'Subject';
            if (subId && !subjectsMap.has(subId)) {
              subjectsMap.set(subId, subName);
            }
          });
        }
      });
      const subjects = Array.from(subjectsMap.entries()).map(([id, name]) => ({ id, name }));

      // Table Header
      const tableTop = doc.y;
      const rowHeight = 20;
      const studentColWidth = 120;
      const subjectColWidth = 60;
      const totalColWidth = 60;
      const headerCols = ['Student', 'Admission No', ...subjects.map(s => s.name), 'Total'];
      const colWidths = [studentColWidth, 80, ...subjects.map(() => subjectColWidth), totalColWidth];

      doc.fontSize(8).font('Helvetica-Bold');
      let x = 50;
      headerCols.forEach((header, i) => {
        doc.text(header, x, tableTop, { width: colWidths[i], align: i === 0 || i === 1 ? 'left' : 'center' });
        x += colWidths[i];
      });

      // Draw header line
      doc.moveTo(50, tableTop + 15)
        .lineTo(750, tableTop + 15)
        .stroke();

      // Table Rows
      doc.fontSize(7).font('Helvetica');
      let y = tableTop + 20;
      
      results.forEach((result) => {
        // Check if we need a new page
        if (y > 500) {
          doc.addPage();
          y = 50;
          // Redraw header on new page
          doc.fontSize(8).font('Helvetica-Bold');
          x = 50;
          headerCols.forEach((header, i) => {
            doc.text(header, x, y, { width: colWidths[i], align: i === 0 || i === 1 ? 'left' : 'center' });
            x += colWidths[i];
          });
          doc.moveTo(50, y + 15)
            .lineTo(750, y + 15)
            .stroke();
          y += 20;
          doc.fontSize(7).font('Helvetica');
        }

        const student = result.student || {};
        const studentName = student.name || student.fullName || student.personalInfo?.fullName || 'N/A';
        const admissionNo = student.studentId || student.admissionNo || 'N/A';

        x = 50;
        doc.text(studentName, x, y, { width: colWidths[0], align: 'left' });
        x += colWidths[0];
        doc.text(admissionNo, x, y, { width: colWidths[1], align: 'left' });
        x += colWidths[1];

        // Subject marks
        subjects.forEach(sub => {
          const subjectMark = result.marks?.subjectMarks?.find(sm => 
            (sm.subject?._id?.toString() || sm.subject?.toString() || sm.subject) === sub.id
          );
          const marksObtained = subjectMark?.marksObtained || subjectMark?.obtainedMarks || '-';
          const maxMarks = subjectMark?.maxMarks || '';
          const displayText = marksObtained !== '-' ? `${marksObtained}${maxMarks ? `/${maxMarks}` : ''}` : '-';
          doc.text(displayText, x, y, { width: subjectColWidth, align: 'center' });
          x += subjectColWidth;
        });

        // Total marks
        const totalObtained = result.marks?.obtained || result.marks?.totalMarksObtained || '-';
        const totalMax = result.marks?.total || result.marks?.totalMaxMarks || '';
        const totalText = totalObtained !== '-' ? `${totalObtained}${totalMax ? `/${totalMax}` : ''}` : '-';
        doc.text(totalText, x, y, { width: totalColWidth, align: 'center' });

        y += rowHeight;
      });

      // Summary Statistics
      doc.moveDown(1);
      const summaryY = doc.y;
      doc.fontSize(9).font('Helvetica-Bold')
        .text('SUMMARY', 50, summaryY);
      doc.fontSize(8).font('Helvetica');
      const stats = results.reduce((acc, r) => {
        acc.total++;
        if (r.attendance === 'present' || r.attendance === 'Present') acc.present++;
        if (r.attendance === 'absent' || r.attendance === 'Absent') acc.absent++;
        if (r.result?.status === 'pass' || r.result?.status === 'Pass') acc.passed++;
        return acc;
      }, { total: 0, present: 0, absent: 0, passed: 0 });

      doc.text(`Total Students: ${stats.total}`, 50, summaryY + 15);
      doc.text(`Present: ${stats.present}`, 200, summaryY + 15);
      doc.text(`Absent: ${stats.absent}`, 350, summaryY + 15);
      doc.text(`Passed: ${stats.passed}`, 500, summaryY + 15);
      doc.text(`Pass %: ${stats.total > 0 ? Math.round((stats.passed / stats.total) * 100) : 0}%`, 650, summaryY + 15);

      // Footer
      doc.fontSize(7).font('Helvetica')
        .text(`Generated on: ${new Date().toLocaleString('en-IN')}`, 50, 500, { align: 'left' });

      doc.end();
      stream.on('finish', () => resolve(outputPath));
      stream.on('error', reject);
    } catch (error) {
      reject(error);
    }
  });
};
